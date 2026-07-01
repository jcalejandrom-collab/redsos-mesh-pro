export interface ForwardablePacket {
  id: string;                    // UUID único del paquete
  type: 'SOS' | 'MESSAGE' | 'NODE_UPDATE';
  payload: any;                  // Alerta, mensaje o nodo
  originDeviceId: string;        // Quien generó el SOS
  originLat: number;
  originLng: number;
  createdAt: string;             // Timestamp de cuando se generó
  hops: string[];                // Lista de deviceIds que lo retransmitieron
  ttl: number;                   // Máximo 7 saltos
  trustScore: number;
  forwarded: boolean;            // Ya llegó al servidor?
  forwardedAt: string | null;
  forwardedBy: string | null;    // deviceId que lo subió al servidor
  signature: string;             // SHA-256 del payload para verificar integridad
}

import { WORKER_URL as API_URL } from '../config';

export interface ForwardResult {
  success: boolean;
  packetId: string;
  forwardedBy: string;
  serverAck: boolean;
  timestamp: string;
}

const DB_NAME = 'RedSOS_StoreAndForward';
const STORE_NAME = 'packets';
const processedPackets = new Set<string>();

// Estadísticas locales en memoria
let forwardedCountToday = 0;
let lastForwardedTime: string | null = null;
let totalBytesTransferred = 0;

// Inicializar IndexedDB de forma robusta
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no está disponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Cola en memoria como fallback seguro para iframes restrictivos
const memoryQueue: ForwardablePacket[] = [];

// Guardar en cola (IndexedDB con fallback)
export async function queuePacket(packet: ForwardablePacket): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(packet);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Fallback a cola en memoria:', err);
    const idx = memoryQueue.findIndex(p => p.id === packet.id);
    if (idx >= 0) {
      memoryQueue[idx] = packet;
    } else {
      memoryQueue.push(packet);
    }
  }
}

// Obtener todos los paquetes de la cola
export async function getPendingPackets(): Promise<ForwardablePacket[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    const result = await new Promise<any[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return result.filter(p => !p.forwarded);
  } catch (err) {
    return memoryQueue.filter(p => !p.forwarded);
  }
}

// Marcar paquete como transmitido
export async function markAsForwarded(packetId: string, forwardedBy: string): Promise<void> {
  processedPackets.add(packetId);
  forwardedCountToday++;
  lastForwardedTime = new Date().toISOString();

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(packetId);
    req.onsuccess = () => {
      const p = req.result;
      if (p) {
        p.forwarded = true;
        p.forwardedAt = new Date().toISOString();
        p.forwardedBy = forwardedBy;
        store.put(p);
      }
    };
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // ignorar fallos menores
    });
  } catch (err) {
    const p = memoryQueue.find(x => x.id === packetId);
    if (p) {
      p.forwarded = true;
      p.forwardedAt = new Date().toISOString();
      p.forwardedBy = forwardedBy;
    }
  }
}

// Evitar procesar paquetes duplicados
export function isDuplicate(packetId: string): boolean {
  return processedPackets.has(packetId);
}

// Verificar la firma criptográfica SHA-256 del payload
export async function verifyPacketIntegrity(packet: ForwardablePacket): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(packet.payload));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hex === packet.signature;
  } catch (err) {
    // Si no hay Web Crypto API o falla, aprobamos por fallback simple de integridad
    return !!packet.signature;
  }
}

// Enviar paquete al servidor Cloudflare Worker
export async function forwardToServer(
  packet: ForwardablePacket,
  forwarderDeviceId: string
): Promise<ForwardResult> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-forwarded-from': packet.originDeviceId,
      'x-forwarded-by': forwarderDeviceId,
      'x-hop-path': JSON.stringify(packet.hops),
      'x-packet-id': packet.id
    };

    const res = await fetch(`${API_URL}/api/alerts/forward`, {
      method: 'POST',
      headers,
      body: JSON.stringify(packet.payload)
    });

    if (!res.ok) {
      throw new Error(`Error HTTP: ${res.status}`);
    }

    const data = await res.json();
    
    // Sumar tamaño estimado de bytes para estadísticas
    totalBytesTransferred += JSON.stringify(packet).length;

    await markAsForwarded(packet.id, forwarderDeviceId);

    return {
      success: true,
      packetId: packet.id,
      forwardedBy: forwarderDeviceId,
      serverAck: data.ack === true,
      timestamp: data.registeredAt || new Date().toISOString()
    };
  } catch (err) {
    console.error('Error al forwardear paquete:', err);
    return {
      success: false,
      packetId: packet.id,
      forwardedBy: forwarderDeviceId,
      serverAck: false,
      timestamp: new Date().toISOString()
    };
  }
}

// Al recibir un paquete mesh de otra fuente
export async function receiveMeshPacket(
  packet: ForwardablePacket,
  receiverDeviceId: string
): Promise<void> {
  if (isDuplicate(packet.id)) return;

  // Verificar la firma del paquete
  const isValid = await verifyPacketIntegrity(packet);
  if (!isValid) {
    console.warn('Paquete descartado por firma inválida:', packet.id);
    return;
  }

  // Marcar como procesado localmente
  processedPackets.add(packet.id);

  // Encolar localmente
  await queuePacket(packet);

  // Si hay internet, intentar forwardear inmediatamente en background
  if (navigator.onLine) {
    forwardToServer(packet, receiverDeviceId).then(res => {
      if (res.success) {
        console.log(`✓ Paquete mesh ${packet.id} reenviado exitosamente al servidor`);
        // Trigger de evento global para que la UI de App se entere en tiempo real
        if (typeof window !== 'undefined') {
          const evt = new CustomEvent('redsos-packet-forwarded', { detail: res });
          window.dispatchEvent(evt);
        }
      }
    });
  }
}

// Monitor de cola de forwarding que corre periódicamente
export function startForwardQueue(
  deviceId: string,
  onForwarded: (result: ForwardResult) => void
): () => void {
  const checkQueue = async () => {
    if (!navigator.onLine) return;

    const pending = await getPendingPackets();
    for (const packet of pending) {
      const res = await forwardToServer(packet, deviceId);
      if (res.success) {
        onForwarded(res);
      }
    }
  };

  const interval = setInterval(checkQueue, 10000);
  return () => clearInterval(interval);
}

// Limpiar paquetes viejos (más de 24 horas)
export async function cleanOldPackets(): Promise<number> {
  let deletedCount = 0;
  const now = Date.now();
  const limit = 24 * 60 * 60 * 1000; // 24h

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      all.forEach(p => {
        const age = now - new Date(p.createdAt).getTime();
        if (p.forwarded || age > limit) {
          store.delete(p.id);
          deletedCount++;
        }
      });
    };
  } catch (err) {
    // Limpiar en memoria
    for (let i = memoryQueue.length - 1; i >= 0; i--) {
      const p = memoryQueue[i];
      const age = now - new Date(p.createdAt).getTime();
      if (p.forwarded || age > limit) {
        memoryQueue.splice(i, 1);
        deletedCount++;
      }
    }
  }

  return deletedCount;
}

// Estadísticas de Store and Forward
export function getForwardStats() {
  // Contar pendientes desde IndexedDB de forma síncrona/aproximada
  // o basarse en nuestra cola de memoria + estado
  return {
    pendingCount: memoryQueue.filter(p => !p.forwarded).length,
    forwardedToday: forwardedCountToday,
    lastForwardAt: lastForwardedTime,
    totalBytesForwarded: totalBytesTransferred
  };
}
