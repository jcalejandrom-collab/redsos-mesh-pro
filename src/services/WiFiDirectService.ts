/**
 * RedSOS - Prompt 1: WiFiDirectService.ts
 * Servicio para simular y manejar redes P2P WiFi Direct en RedSOS.
 * Permite establecer un grupo, conectar clientes, transmitir paquetes mesh por WebSocket en puerto 8765
 * y transferir archivos usando chunking en puerto 8766.
 */

import { MeshPacket, relayPacket } from './BluetoothMeshService';
import { receiveMeshPacket, isDuplicate } from './StoreAndForwardService';

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

  const forwardable = {
    id: packet.uuid,
    type: (packet.type === 'SOS' ? 'SOS' : 'MESSAGE') as 'SOS' | 'MESSAGE',
    payload: {
      latitude: packet.payload.lat,
      longitude: packet.payload.lng,
      battery_level: packet.payload.battery,
      description: packet.payload.description,
      user_name: packet.senderName,
      connection_type: 'wifi_direct' as const,
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

// Variables de estado local del servicio
let isGroupOwner = false;
let groupSSID: string | null = null;
let groupPassword: string | null = null;
let connectedToGroup = false;

interface PeerDevice {
  ip: string;
  deviceId: string;
  trustScore: number;
  battery: number;
}

// Simulador de dispositivos conectados
const connectedPeersList: PeerDevice[] = [
  { ip: '192.168.49.12', deviceId: 'node-bqto-502', trustScore: 0.95, battery: 88 },
  { ip: '192.168.49.54', deviceId: 'node-bqto-104', trustScore: 0.40, battery: 72 },
  { ip: '192.168.49.101', deviceId: 'node-bqto-882', trustScore: 0.85, battery: 91 }
];

// Handlers registrados de paquetes
const packetHandlers = new Set<(packet: MeshPacket) => void>();

/**
 * Iniciar modo WiFi Direct como Group Owner (router local)
 */
export async function startWiFiDirectGroup(): Promise<{
  ssid: string;      // REDSOS-MESH-{deviceId}
  password: string;  // generada aleatoriamente 12 chars
  ipGateway: string; // 192.168.49.1
}> {
  // Simular inicio de grupo WiFi Direct
  const randomId = Math.floor(1000 + Math.random() * 9000);
  const deviceId = `node-bqto-${randomId}`;
  const generatedPassword = Math.random().toString(36).substring(2, 14).toUpperCase();
  
  isGroupOwner = true;
  groupSSID = `REDSOS-MESH-${deviceId}`;
  groupPassword = generatedPassword;
  connectedToGroup = true;

  console.log(`[WiFi Direct] Grupo iniciado de forma local. SSID: ${groupSSID}, PW: ${groupPassword}`);
  
  return {
    ssid: groupSSID,
    password: groupPassword,
    ipGateway: '192.168.49.1'
  };
}

/**
 * Conectar a un grupo WiFi Direct existente
 */
export async function connectToWiFiDirectGroup(
  ssid: string,
  password: string
): Promise<void> {
  if (!ssid || !password) {
    throw new Error('SSID y Password requeridos para conectarse al grupo');
  }

  // Simular retardo de conexión de red WiFi P2P
  await new Promise(resolve => setTimeout(resolve, 1500));

  isGroupOwner = false;
  groupSSID = ssid;
  groupPassword = password;
  connectedToGroup = true;

  console.log(`[WiFi Direct] Conectado exitosamente al grupo: ${ssid}`);
}

/**
 * Transmitir paquete MeshPacket por WiFi Direct (alcance 200m)
 * Usa WebSocket local simulado en puerto 8765
 */
export async function broadcastViaWiFiDirect(packet: MeshPacket): Promise<void> {
  if (!connectedToGroup) {
    throw new Error('Debe estar conectado a un grupo WiFi Direct para transmitir.');
  }

  // Restricción: Máximo 200KB por paquete mesh
  const packetStr = JSON.stringify(packet);
  const packetSizeKB = new TextEncoder().encode(packetStr).length / 1024;
  if (packetSizeKB > 200) {
    throw new Error(`Exceso de tamaño: El paquete de ${packetSizeKB.toFixed(1)}KB supera el límite de 200KB.`);
  }

  console.log(`[WiFi Direct WS:8765] Transmitiendo paquete ${packet.uuid} a través del grupo. Tamaño: ${packetSizeKB.toFixed(1)}KB`);

  // Simular la propagación a los dispositivos clientes en el rango (alcance ~200m)
  setTimeout(() => {
    packetHandlers.forEach(handler => {
      try {
        // En un entorno de red real, esto viajaría por un túnel WebSocket
        handler(packet);
      } catch (err) {
        console.error('Error en handler WiFi Direct:', err);
      }
    });
  }, 100);
}

/**
 * Escuchar paquetes entrantes de otros nodos
 */
export async function listenWiFiDirect(
  onPacket: (packet: MeshPacket) => void
): Promise<void> {
  const handler = (packet: MeshPacket) => {
    handleIncomingPacket(packet);
    onPacket(packet);
  };
  packetHandlers.add(handler);
  console.log('[WiFi Direct WS:8765] Escuchador registrado para paquetes Mesh.');
}

/**
 * Listar dispositivos RedSOS conectados al grupo
 */
export async function getConnectedPeers(): Promise<{
  ip: string;
  deviceId: string;
  trustScore: number;
  battery: number;
}[]> {
  if (!connectedToGroup) {
    return [];
  }
  return [...connectedPeersList];
}

/**
 * Transferir archivo (foto de daños, audio SOS) entre nodos
 * Soporta hasta 5MB vía chunking de 512KB. Usa puerto HTTP 8766
 */
export async function transferFile(
  targetIp: string,
  file: Blob,
  metadata: { type: 'PHOTO' | 'AUDIO'; alertId: string }
): Promise<void> {
  if (!connectedToGroup) {
    throw new Error('Debe estar conectado a un grupo WiFi Direct para transferir archivos.');
  }

  // Restricción: Archivos hasta 5MB
  const maxFileSizeBytes = 5 * 1024 * 1024; // 5MB
  if (file.size > maxFileSizeBytes) {
    throw new Error(`Exceso de tamaño: El archivo de ${(file.size / (1024 * 1024)).toFixed(1)}MB supera el límite de 5MB.`);
  }

  const chunkSize = 512 * 1024; // 512KB
  const totalChunks = Math.ceil(file.size / chunkSize);
  console.log(`[WiFi Direct HTTP:8766] Iniciando transferencia hacia ${targetIp}. Total: ${totalChunks} chunks de 512KB.`);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    // Simulación del envío del chunk a través de HTTP POST ficticio al puerto 8766
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        console.log(`[WiFi Direct HTTP:8766] Transmitido chunk ${chunkIndex + 1}/${totalChunks} (${chunk.size} bytes) a ${targetIp}`);
        resolve();
      }, 200); // 200ms por chunk de simulación
    });
  }

  console.log(`[WiFi Direct HTTP:8766] Transferencia de tipo ${metadata.type} para alerta ${metadata.alertId} finalizada correctamente.`);
}
