import { MeshPacket } from './BluetoothMeshService';

// Helpers para convertir de ArrayBuffer a Hexadecimal y viceversa
function bufToHex(buffer: ArrayBuffer): string {
  return Array.prototype.map.call(new Uint8Array(buffer), (x: number) => ('00' + x.toString(16)).slice(-2)).join('');
}

function hexToBuf(hex: string): ArrayBuffer {
  const view = new Uint8Array(hex.length / 2);
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return view.buffer;
}

// Generar par de claves Ed25519 para un brigadista
export async function generateKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyHex: string;
}> {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  );

  const exportedPublic = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyHex = bufToHex(exportedPublic);

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyHex
  };
}

// Exportar clave pública como hex para almacenar en el servidor/KV
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return bufToHex(exported);
}

// Importar clave pública de otro brigadista desde hex
export async function importPublicKey(hexKey: string): Promise<CryptoKey> {
  const buffer = hexToBuf(hexKey);
  return await window.crypto.subtle.importKey(
    'raw',
    buffer,
    { name: 'Ed25519' },
    true,
    ['verify']
  );
}

// Obtener los datos canonizados de un paquete para firmar/hashear
function getPacketBytes(packet: MeshPacket): Uint8Array {
  // Excluimos la firma y el hash propios antes de calcular para evitar circularidades
  const canon = {
    uuid: packet.uuid,
    type: packet.type,
    senderId: packet.senderId,
    senderName: packet.senderName,
    trustScore: packet.trustScore,
    payload: packet.payload,
    ttl: packet.ttl,
    hops: packet.hops,
    hopPath: packet.hopPath
  };
  const str = JSON.stringify(canon);
  return new TextEncoder().encode(str);
}

// Firmar un paquete MeshPacket con clave privada Ed25519
export async function signPacket(
  packet: MeshPacket,
  privateKey: CryptoKey
): Promise<string> {
  const bytes = getPacketBytes(packet);
  const signatureBuffer = await window.crypto.subtle.sign(
    { name: 'Ed25519' },
    privateKey,
    bytes
  );
  return bufToHex(signatureBuffer);
}

// Verificar firma de un paquete recibido
export async function verifyPacketSignature(
  packet: MeshPacket,
  signature: string,
  publicKey: CryptoKey
): Promise<boolean> {
  try {
    const bytes = getPacketBytes(packet);
    const signatureBuffer = hexToBuf(signature);
    return await window.crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      signatureBuffer,
      bytes
    );
  } catch (e) {
    console.error('[CryptoService] Error verificando firma:', e);
    return false;
  }
}

// Hash SHA-256 real del contenido del paquete
export async function hashPacket(packet: MeshPacket): Promise<string> {
  const bytes = getPacketBytes(packet);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', bytes);
  return bufToHex(hashBuffer);
}

// Derivar clave criptográfica a partir de una contraseña/PIN usando PBKDF2
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encriptar datos sensibles con AES-GCM antes de guardar en localStorage
export async function encryptForStorage(
  data: string,
  password: string
): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  
  const encoder = new TextEncoder();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  // Unir salt, iv y ciphertext en un único payload guardado en Hex
  const payload = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  payload.set(salt, 0);
  payload.set(iv, salt.length);
  payload.set(new Uint8Array(encrypted), salt.length + iv.length);

  return bufToHex(payload.buffer);
}

// Desencriptar datos de localStorage
export async function decryptFromStorage(
  encryptedHex: string,
  password: string
): Promise<string> {
  try {
    const payload = new Uint8Array(hexToBuf(encryptedHex));
    const salt = payload.slice(0, 16);
    const iv = payload.slice(16, 28);
    const ciphertext = payload.slice(28);

    const key = await deriveKey(password, salt);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('[CryptoService] Error de desencriptación AES-GCM:', error);
    throw new Error('Contraseña/PIN incorrecto o datos dañados.');
  }
}

// Guardar clave privada del brigadista en localStorage encriptada con PIN
export async function savePrivateKey(
  privateKey: CryptoKey,
  userPin: string
): Promise<void> {
  const exported = await window.crypto.subtle.exportKey('pkcs8', privateKey);
  const hex = bufToHex(exported);
  const encrypted = await encryptForStorage(hex, userPin);
  localStorage.setItem('redsos_brigadist_private_key_enc', encrypted);
}

// Recuperar clave privada del brigadista desde localStorage desencriptándola con PIN
export async function loadPrivateKey(
  userPin: string
): Promise<CryptoKey | null> {
  const encrypted = localStorage.getItem('redsos_brigadist_private_key_enc');
  if (!encrypted) return null;
  try {
    const hex = await decryptFromStorage(encrypted, userPin);
    const buffer = hexToBuf(hex);
    return await window.crypto.subtle.importKey(
      'pkcs8',
      buffer,
      { name: 'Ed25519' },
      true,
      ['sign']
    );
  } catch (err) {
    console.error('[CryptoService] Error cargando clave privada (PIN inválido):', err);
    return null;
  }
}

// Generar hash del token admin para no guardarlo en texto plano
export async function hashAdminToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(token));
  return bufToHex(hashBuffer);
}

// Verificar token admin comparando hashes
export async function verifyAdminToken(
  inputToken: string,
  storedHash: string
): Promise<boolean> {
  const hashedInput = await hashAdminToken(inputToken);
  return hashedInput === storedHash;
}
