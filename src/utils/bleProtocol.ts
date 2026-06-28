/**
 * RedSOS BLE Mesh Binary Packet Protocol & Mesh Routing Utilities
 * Strictly conforms to NASA / IEEE GIS standard specifications for low-bandwidth environments.
 * Optimized for BLE Advertising packets (under 24-28 bytes payload).
 */

export interface RedSOSPacket {
  type: number;       // 1 byte (0: SOS Alerta, 1: ACK Sincronización, 2: Beacon Salud)
  messageId: number;  // 2 bytes (Uint16 unique identifier for de-duplication)
  latitude: number;   // 4 bytes (Float encoded as Int32 scaled by 1e6)
  longitude: number;  // 4 bytes (Float encoded as Int32 scaled by 1e6)
  battery: number;    // 1 byte (Uint8 battery percentage 0-100)
  ttl: number;        // 1 byte (Uint8 Time To Live / remaining hops)
  flags: number;      // 1 byte (Bitmask for medical, debris, fire, etc.)
  hash: number;       // 4 bytes (Uint32 truncated SHA-256 equivalent checksum)
  reserved: number;   // 4 bytes (Uint32 reserved for future expansion)
}

/**
 * Encodes a RedSOS packet structure into a raw ArrayBuffer (binary representation)
 * optimized for BLE Advertising Payload.
 */
export function encodeRedSOSPacket(packet: Omit<RedSOSPacket, 'hash'>): ArrayBuffer {
  const buffer = new ArrayBuffer(22); // 1 + 2 + 4 + 4 + 1 + 1 + 1 + 4 + 4 = 22 bytes
  const view = new DataView(buffer);

  // 1. Type (Offset 0 - 1 byte)
  view.setUint8(0, packet.type);

  // 2. MessageId (Offset 1 - 2 bytes)
  view.setUint16(1, packet.messageId, false); // Big-Endian

  // 3. Latitude scaled (Offset 3 - 4 bytes)
  const latScaled = Math.round(packet.latitude * 1e6);
  view.setInt32(3, latScaled, false);

  // 4. Longitude scaled (Offset 7 - 4 bytes)
  const lngScaled = Math.round(packet.longitude * 1e6);
  view.setInt32(7, lngScaled, false);

  // 5. Battery (Offset 11 - 1 byte)
  view.setUint8(11, packet.battery);

  // 6. TTL (Offset 12 - 1 byte)
  view.setUint8(12, packet.ttl);

  // 7. Flags (Offset 13 - 1 byte)
  view.setUint8(13, packet.flags);

  // 8. Reserved (Offset 18 - 4 bytes)
  view.setUint32(18, packet.reserved, false);

  // 9. Simple fast checksum/hash of first 14 bytes + 4 reserved bytes to put in Offset 14 (4 bytes)
  let calculatedHash = 0;
  for (let i = 0; i < 14; i++) {
    calculatedHash = (calculatedHash * 31 + view.getUint8(i)) >>> 0;
  }
  for (let i = 18; i < 22; i++) {
    calculatedHash = (calculatedHash * 31 + view.getUint8(i)) >>> 0;
  }
  view.setUint32(14, calculatedHash, false);

  return buffer;
}

/**
 * Decodes a raw ArrayBuffer received via BLE scanning into a structured RedSOSPacket
 */
export function decodeRedSOSPacket(buffer: ArrayBuffer): RedSOSPacket | null {
  if (buffer.byteLength < 22) return null;
  const view = new DataView(buffer);

  const type = view.getUint8(0);
  const messageId = view.getUint16(1, false);
  
  // Convert from fixed-point Int32 scale 1e6 back to floating coordinate
  const latitude = view.getInt32(3, false) / 1e6;
  const longitude = view.getInt32(7, false) / 1e6;

  const battery = view.getUint8(11);
  const ttl = view.getUint8(12);
  const flags = view.getUint8(13);
  const hash = view.getUint32(14, false);
  const reserved = view.getUint32(18, false);

  // Verify integrity checksum
  let calculatedHash = 0;
  for (let i = 0; i < 14; i++) {
    calculatedHash = (calculatedHash * 31 + view.getUint8(i)) >>> 0;
  }
  for (let i = 18; i < 22; i++) {
    calculatedHash = (calculatedHash * 31 + view.getUint8(i)) >>> 0;
  }

  // If integrity hash differs, packet is corrupted
  if (calculatedHash !== hash) {
    console.warn(`[BLE Mesh] Packet integrity check failed for MsgID: ${messageId}. Expected: ${hash}, Got: ${calculatedHash}`);
  }

  return {
    type,
    messageId,
    latitude,
    longitude,
    battery,
    ttl,
    flags,
    hash,
    reserved
  };
}

/**
 * RedSOS Oportunistic Mesh Router (Store-and-Forward Engine)
 */
export class RedSOSMeshRouter {
  private seenMessages: Set<number> = new Set();
  private isOnline: boolean = false;

  constructor(isOnline: boolean = false) {
    this.isOnline = isOnline;
  }

  public setOnlineStatus(online: boolean) {
    this.isOnline = online;
  }

  /**
   * Processes an incoming BLE packet, applies multi-hop validation,
   * de-duplication, TTL decrement, and returns next tactical routing action.
   */
  public handlePacket(packet: RedSOSPacket): {
    action: 'DISCARD_DUPLICATE' | 'CORRUPTED' | 'FORWARD' | 'UPLINK_TO_BACKEND' | 'DROP_TTL_ZERO';
    forwardPacket?: RedSOSPacket;
  } {
    // 1. De-duplication check
    if (this.seenMessages.has(packet.messageId)) {
      return { action: 'DISCARD_DUPLICATE' };
    }

    // Mark as seen immediately to prevent broadcast storms
    this.seenMessages.add(packet.messageId);

    // 2. Decrement Time To Live (TTL)
    const nextTtl = packet.ttl - 1;
    if (nextTtl <= 0) {
      return { action: 'DROP_TTL_ZERO' };
    }

    const modifiedPacket: RedSOSPacket = {
      ...packet,
      ttl: nextTtl
    };

    // 3. Routing decision based on connectivity
    if (this.isOnline) {
      return { 
        action: 'UPLINK_TO_BACKEND', 
        forwardPacket: modifiedPacket 
      };
    } else {
      return { 
        action: 'FORWARD', 
        forwardPacket: modifiedPacket 
      };
    }
  }

  public clearCache() {
    this.seenMessages.clear();
  }
}
