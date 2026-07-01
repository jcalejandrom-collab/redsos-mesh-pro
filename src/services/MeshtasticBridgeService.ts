/**
 * RedSOS - Capa 3: MeshtasticBridgeService.ts
 * Integración con nodos de radio Meshtastic/LoRa de largo alcance (5-15 km).
 */

import { MeshPacket } from './BluetoothMeshService';

const REDSOS_LORA_CHANNEL = {
  name: 'REDSOS-IAGAMI',
  psk: 'redsos-barquisimeto-2026',
  frequency: 915, // MHz — banda libre Venezuela
  spreadingFactor: 10,
  bandwidth: 250,
  codingRate: 8
};

let meshtasticConnected = false;
const loraHandlers = new Set<(packet: MeshPacket) => void>();

/**
 * Conectar con nodo Meshtastic via BLE, Serial o TCP
 */
export async function connectToMeshtasticNode(
  connectionType: 'BLE' | 'SERIAL' | 'TCP'
): Promise<void> {
  console.log(`Estableciendo enlace de radio LoRa con nodo Meshtastic vía: ${connectionType}...`);
  meshtasticConnected = true;
}

/**
 * Traducir MeshPacket de RedSOS al protocolo Meshtastic Protobuf
 * Simulación de serialización binaria manual para evitar librerías externas.
 */
export function translateToMeshtastic(packet: MeshPacket): Uint8Array {
  const jsonStr = JSON.stringify(packet);
  return new TextEncoder().encode(jsonStr);
}

/**
 * Traducir mensaje Meshtastic recibido a MeshPacket de RedSOS
 * Deserialización binaria a JSON string.
 */
export function translateFromMeshtastic(data: Uint8Array): MeshPacket {
  const jsonStr = new TextDecoder().decode(data);
  return JSON.parse(jsonStr) as MeshPacket;
}

/**
 * Enviar alerta SOS a través de la red LoRa
 */
export async function sendSOSviaLoRa(packet: MeshPacket): Promise<void> {
  if (!meshtasticConnected) {
    console.warn("Meshtastic no conectado. Intentando reconexión automática...");
    await connectToMeshtasticNode('SERIAL');
  }

  console.log(`Emitiendo SOS por canal LoRa ${REDSOS_LORA_CHANNEL.name} (${REDSOS_LORA_CHANNEL.frequency} MHz)...`);
  const payloadBin = translateToMeshtastic(packet);
  console.log(`Paquete serializado: ${payloadBin.length} bytes emitidos.`);
  
  // Propagar a los escuchas locales
  triggerLoraHandlers(packet);
}

/**
 * Escuchar mensajes entrantes de la red LoRa
 */
export async function listenLoRaNetwork(
  onPacket: (packet: MeshPacket) => void
): Promise<void> {
  loraHandlers.add(onPacket);
  console.log(`Escuchando en la frecuencia LoRa ${REDSOS_LORA_CHANNEL.frequency} MHz...`);
}

function triggerLoraHandlers(packet: MeshPacket) {
  loraHandlers.forEach(handler => {
    try {
      handler(packet);
    } catch (e) {
      console.error("Error en handler LoRa:", e);
    }
  });
}

/**
 * Obtener nodos Meshtastic activos en un radio de X km
 * Basado en Barquisimeto, Venezuela (lat 10.07, lng -69.31)
 */
export async function getNearbyMeshtasticNodes(
  radiusKm: number
): Promise<{ nodeId: string; lat: number; lng: number; battery: number; snr: number }[]> {
  // Simulando geolocalizaciones reales en Barquisimeto
  const bqtoNodes = [
    { nodeId: 'LORA-NODE-ESTE', lat: 10.072, lng: -69.300, battery: 92, snr: 9.5 },     // Zona del Este
    { nodeId: 'LORA-NODE-CENTRO', lat: 10.068, lng: -69.325, battery: 78, snr: 6.2 },   // Zona del Centro
    { nodeId: 'LORA-NODE-OESTE', lat: 10.065, lng: -69.355, battery: 12, snr: 3.1 },    // Zona Oeste (Baja batería)
    { nodeId: 'LORA-NODE-NORTE', lat: 10.098, lng: -69.312, battery: 85, snr: 8.8 },    // El Cují / Tamaca
    { nodeId: 'LORA-NODE-CABUDARE', lat: 10.035, lng: -69.278, battery: 60, snr: 5.4 }  // Cabudare
  ];

  // Distancia haversine simple aproximada para filtrar
  const centerLat = 10.07;
  const centerLng = -69.31;

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radio de la tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  return bqtoNodes.filter(n => {
    const dist = calculateDistance(centerLat, centerLng, n.lat, n.lng);
    return dist <= radiusKm;
  });
}

/**
 * Calcular ruta óptima Dijkstra entre nodos LoRa
 * @param sourceId ID del nodo origen
 * @param destId ID del nodo destino
 * @param nodes Listado de nodos de radio disponibles
 * @returns Listado secuencial de hops óptimos
 */
export function calculateLoRaRoute(
  sourceId: string,
  destId: string,
  nodes: { nodeId: string; lat: number; lng: number; battery: number }[]
): string[] {
  // Dijkstra simple: Calcula ruta óptima ponderando distancia geográfica y nivel de batería.
  // Penalizamos nodos que tienen menos del 30% de batería para que la red no se sobrecargue en zonas vulnerables.
  
  const getDistanceCost = (
    n1: { nodeId: string; lat: number; lng: number; battery: number },
    n2: { nodeId: string; lat: number; lng: number; battery: number }
  ) => {
    const dLat = n2.lat - n1.lat;
    const dLng = n2.lng - n1.lng;
    const baseDist = Math.sqrt(dLat * dLat + dLng * dLng);
    
    // Penalización drástica de batería baja (costo x3 si está baja)
    const batteryPenalization = n2.battery < 30 ? 3.0 : 1.0;
    return baseDist * batteryPenalization;
  };

  const nodeMap = new Map<string, typeof nodes[0]>();
  nodes.forEach(n => nodeMap.set(n.nodeId, n));

  if (!nodeMap.has(sourceId) || !nodeMap.has(destId)) {
    return [];
  }

  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const queue: string[] = [];

  nodes.forEach(n => {
    distances[n.nodeId] = Infinity;
    previous[n.nodeId] = null;
    queue.push(n.nodeId);
  });

  distances[sourceId] = 0;

  while (queue.length > 0) {
    // Buscar nodo con menor costo acumulado
    queue.sort((a, b) => distances[a] - distances[b]);
    const u = queue.shift()!;

    if (u === destId) break;
    if (distances[u] === Infinity) break;

    const uNode = nodeMap.get(u)!;

    // Calcular costes con vecinos aún en cola
    queue.forEach(v => {
      const vNode = nodeMap.get(v)!;
      const cost = getDistanceCost(uNode, vNode);
      const alt = distances[u] + cost;
      if (alt < distances[v]) {
        distances[v] = alt;
        previous[v] = u;
      }
    });
  }

  // Reconstruir el camino de Saltos (Hops)
  const path: string[] = [];
  let current: string | null = destId;
  while (current !== null) {
    path.unshift(current);
    current = previous[current];
  }

  if (path[0] === sourceId) {
    return path;
  }
  return [];
}
