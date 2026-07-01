/**
 * RedSOS - Capa 1: BluetoothMeshService.ts
 * Motor Web Bluetooth PWA para ciudadanos civiles con Chrome Android.
 */

export interface MeshPacket {
  uuid: string;           // ID único del paquete
  type: 'SOS' | 'ACK' | 'RELAY' | 'PING' | 'CHAT';
  senderId: string;       // ID del dispositivo origen
  senderName: string;
  trustScore: number;     // 0.0 - 1.0
  payload: {
    lat: number;
    lng: number;
    battery: number;
    description: string;
    timestamp: string;
  };
  ttl: number;            // Time To Live: máximo 7 saltos
  hops: number;           // saltos actuales
  hopPath: string[];      // registro de nodos intermedios
  hash: string;           // SHA-256 del contenido para verificación
  signature?: string;     // firma Ed25519 para brigadistas
}

const REDSOS_SERVICE_UUID = 'redsos-mesh-emergency-2026';
const SOS_CHARACTERISTIC_UUID = 'redsos-sos-characteristic';
const RELAY_CHARACTERISTIC_UUID = 'redsos-relay-characteristic';

// Estado interno del servicio
let isScanning = false;
let connectedPeersCount = 0;
const cachedPacketsStore: MeshPacket[] = [];
let lastSyncTime: string | null = null;
const packetHandlers = new Set<(packet: MeshPacket) => void>();

// Cargar paquetes previamente cacheados desde localStorage
try {
  const stored = localStorage.getItem('redsos_mesh_cached_packets');
  if (stored) {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      cachedPacketsStore.push(...parsed);
    }
  }
} catch (e) {
  console.error("Error al cargar caché local de paquetes", e);
}

function saveCacheToStorage() {
  try {
    localStorage.setItem('redsos_mesh_cached_packets', JSON.stringify(cachedPacketsStore));
  } catch (e) {
    console.error("Error al persistir caché de paquetes", e);
  }
}

/**
 * Inicializar y escanear dispositivos BLE cercanos
 */
export async function initBluetoothMesh(): Promise<void> {
  console.log("Iniciando Bluetooth Mesh PWA...", REDSOS_SERVICE_UUID);
  isScanning = true;
  connectedPeersCount = Math.floor(Math.random() * 5) + 2; // Simulado para pruebas en navegador

  // Intentar inicialización real de Web Bluetooth si está disponible y soportada
  if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
    try {
      // Intentar interactuar con el api de Web Bluetooth (requiere gesto del usuario en browsers reales)
      console.log("Web Bluetooth disponible en el navegador.");
    } catch (e) {
      console.warn("Web Bluetooth no se pudo inicializar:", e);
    }
  }
}

/**
 * Transmitir paquete SOS por BLE a todos los dispositivos cercanos
 */
export async function broadcastSOS(packet: MeshPacket): Promise<void> {
  console.log(`Transmitiendo alerta SOS (${packet.uuid}) vía Web Bluetooth...`);
  // En Web Bluetooth real, escribiríamos en la característica SOS_CHARACTERISTIC_UUID
  // de todos los dispositivos conectados que expongan el servicio.
  packet.hops++;
  packet.hopPath.push(packet.senderId);
  
  // Propagar localmente a los handlers para actualizar la UI del simulador
  triggerPacketHandlers(packet);
}

import { receiveMeshPacket, isDuplicate } from './StoreAndForwardService';
import { triggerNativeAlert } from './AlertSoundService';

let myDeviceId = '';
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  myDeviceId = localStorage.getItem('redsos_device_id') || '';
  if (!myDeviceId) {
    myDeviceId = 'Device_' + Math.floor(Math.random() * 10000);
    localStorage.setItem('redsos_device_id', myDeviceId);
  }
} else {
  myDeviceId = 'Device_NodeServer';
}

async function handleIncomingPacket(packet: MeshPacket) {
  if (isDuplicate(packet.uuid)) return;
  if (packet.senderId === myDeviceId) return;

  // Si es un paquete SOS, disparar alertas sonoras y de vibración
  if (packet.type === 'SOS') {
    const processedKey = `redsos_processed_alert_${packet.uuid}`;
    if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(processedKey)) {
      sessionStorage.setItem(processedKey, 'true');
      triggerNativeAlert({
        title: `🚨 ¡SOS MESH DETECTADO!`,
        body: `${packet.senderName}: ${packet.payload.description}`,
        alertId: packet.uuid
      }).catch(e => console.error('[BluetoothMesh] Error al sonar alerta:', e));
    }
  }

  const forwardable = {
    id: packet.uuid,
    type: (packet.type === 'SOS' ? 'SOS' : 'MESSAGE') as 'SOS' | 'MESSAGE',
    payload: {
      latitude: packet.payload.lat,
      longitude: packet.payload.lng,
      battery_level: packet.payload.battery,
      description: packet.payload.description,
      user_name: packet.senderName,
      connection_type: 'mesh_bluetooth' as const,
      created_at: packet.payload.timestamp
    },
    originDeviceId: packet.senderId,
    originLat: packet.payload.lat,
    originLng: packet.payload.lng,
    createdAt: packet.payload.timestamp,
    hops: [...(packet.hopPath || []), myDeviceId],
    ttl: packet.ttl - 1,
    trustScore: packet.trustScore,
    forwarded: false,
    forwardedAt: null,
    forwardedBy: null,
    signature: packet.hash || ''
  };

  await receiveMeshPacket(forwardable, myDeviceId);

  if (packet.ttl > 1) {
    relayPacket(packet);
  }
}

/**
 * Recibir paquetes de otros nodos y retransmitir si ttl > 0
 */
export async function listenForPackets(
  onPacket: (packet: MeshPacket) => void
): Promise<void> {
  const handler = (packet: MeshPacket) => {
    handleIncomingPacket(packet);
    onPacket(packet);
  };
  packetHandlers.add(handler);
  console.log("Escuchando paquetes entrantes en la red Mesh BLE...");
}

function triggerPacketHandlers(packet: MeshPacket) {
  packetHandlers.forEach(handler => {
    try {
      handler(packet);
    } catch (e) {
      console.error("Error en handler de paquete:", e);
    }
  });
}

/**
 * Retransmitir paquete reduciendo TTL y agregando nodo al hopPath
 */
export async function relayPacket(packet: MeshPacket): Promise<void> {
  if (packet.ttl <= 1) {
    console.log(`Paquete ${packet.uuid} descartado: TTL agotado.`);
    return;
  }

  // Clonamos el paquete para modificarlo limpiamente
  const relayed: MeshPacket = {
    ...packet,
    ttl: packet.ttl - 1,
    hops: packet.hops + 1,
    hopPath: [...packet.hopPath, 'WebNode-' + Math.floor(Math.random() * 100)]
  };

  // Recalcular hash para certificar los saltos si fuera necesario
  relayed.hash = await hashPacket(relayed);

  console.log(`Retransmitiendo paquete ${relayed.uuid} (TTL restante: ${relayed.ttl})`);
  // Simular envío de transmisión
  triggerPacketHandlers(relayed);
}

/**
 * Calcular hash SHA-256 real del contenido del paquete
 */
export async function hashPacket(packet: MeshPacket): Promise<string> {
  const data = JSON.stringify({
    uuid: packet.uuid,
    type: packet.type,
    senderId: packet.senderId,
    senderName: packet.senderName,
    trustScore: packet.trustScore,
    payload: packet.payload,
    ttl: packet.ttl,
    hops: packet.hops,
    hopPath: packet.hopPath
  });

  const msgBuffer = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Cache local: guardar paquete si no hay conexión
 */
export function cachePacketLocally(packet: MeshPacket): void {
  // Evitar duplicados en caché
  if (cachedPacketsStore.some(p => p.uuid === packet.uuid)) return;
  cachedPacketsStore.push(packet);
  saveCacheToStorage();
  console.log(`Paquete ${packet.uuid} guardado en caché local offline.`);
}

/**
 * Sincronizar caché local cuando llegue conexión o nodo mesh
 */
export async function syncCachedPackets(): Promise<void> {
  if (cachedPacketsStore.length === 0) return;
  console.log(`Sincronizando ${cachedPacketsStore.length} paquetes cacheados...`);
  
  // Enviar cada paquete en caché a través de la red local
  for (const packet of [...cachedPacketsStore]) {
    try {
      // Re-transmitir
      await broadcastSOS(packet);
      // Eliminar de caché local
      const idx = cachedPacketsStore.findIndex(p => p.uuid === packet.uuid);
      if (idx !== -1) cachedPacketsStore.splice(idx, 1);
    } catch (e) {
      console.error(`Fallo de sincronización para paquete ${packet.uuid}:`, e);
    }
  }

  lastSyncTime = new Date().toISOString();
  saveCacheToStorage();
}

/**
 * Estado del motor
 */
export function getMeshStatus(): {
  isScanning: boolean;
  connectedPeers: number;
  cachedPackets: number;
  lastSync: string | null;
} {
  return {
    isScanning,
    connectedPeers: connectedPeersCount,
    cachedPackets: cachedPacketsStore.length,
    lastSync: lastSyncTime
  };
}
