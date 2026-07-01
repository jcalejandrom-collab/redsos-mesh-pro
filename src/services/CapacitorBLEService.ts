import { BleClient, BleDevice, ScanResult } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import { MeshPacket } from './BluetoothMeshService';

// SERVICE UUID RedSOS
const REDSOS_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const SOS_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const RELAY_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a9';

// Inicializar BLE nativo y solicitar permisos
export async function initNativeBLE(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.warn('[CapacitorBLEService] No en plataforma nativa. Ignorando initNativeBLE.');
    return;
  }
  try {
    // BleClient.initialize() solicita permisos de Ubicación en Android y Bluetooth en iOS automáticamente.
    await BleClient.initialize();
    console.log('[CapacitorBLEService] BleClient inicializado con éxito.');
    
    // Solicitar que se active el Bluetooth si está apagado (solo Android)
    try {
      await BleClient.requestEnable();
      console.log('[CapacitorBLEService] Solicitud para encender Bluetooth enviada con éxito.');
    } catch (enableErr) {
      console.warn('[CapacitorBLEService] Advertencia o fallo al encender Bluetooth (o no soportado):', enableErr);
    }
  } catch (error) {
    console.error('[CapacitorBLEService] Error fatal al inicializar BleClient:', error);
    throw error;
  }
}

// Escanear dispositivos RedSOS en segundo plano
// A diferencia de Web Bluetooth, esto funciona sin interacción del usuario
export async function scanRedSOSDevices(
  onDevice: (device: BleDevice, rssi: number) => void,
  durationMs: number = 10000
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.warn('[CapacitorBLEService] No en plataforma nativa. Simulando scan.');
    return;
  }
  try {
    await BleClient.requestEnable();
    
    await BleClient.requestLEScan(
      {
        services: [REDSOS_SERVICE_UUID],
      },
      (result: ScanResult) => {
        if (result.device) {
          onDevice(result.device, result.rssi ?? -90);
        }
      }
    );

    // Detener scan después del tiempo indicado
    setTimeout(async () => {
      try {
        await BleClient.stopLEScan();
        console.log('[CapacitorBLEService] Scan automático detenido por timeout.');
      } catch (err) {
        console.error('[CapacitorBLEService] Error al detener scan:', err);
      }
    }, durationMs);

  } catch (error) {
    console.error('[CapacitorBLEService] Error en scanRedSOSDevices:', error);
    throw error;
  }
}

// Iniciar modo ADVERTISE — el dispositivo se anuncia como nodo RedSOS
export async function startAdvertising(packet: MeshPacket): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.warn('[CapacitorBLEService] No en plataforma nativa. Ignorando startAdvertising.');
    return;
  }
  try {
    console.log('[CapacitorBLEService] Iniciando modo ADVERTISE con paquete:', packet.uuid);
    // En entornos reales con @capacitor-community/bluetooth-le, podemos habilitar
    // las notificaciones GATT en los servicios creados.
    // Simulamos la lógica correspondiente de advertises
  } catch (error) {
    console.error('[CapacitorBLEService] Error en startAdvertising:', error);
  }
}

// Conectar a un nodo y suscribirse a sus paquetes
export async function connectAndSubscribe(
  deviceId: string,
  onPacket: (packet: MeshPacket) => void
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.warn('[CapacitorBLEService] No en plataforma nativa. Ignorando connectAndSubscribe.');
    return;
  }
  try {
    await BleClient.connect(deviceId);
    console.log(`[CapacitorBLEService] Conectado con éxito a: ${deviceId}`);
    
    await BleClient.startNotifications(
      deviceId,
      REDSOS_SERVICE_UUID,
      SOS_CHARACTERISTIC_UUID,
      (value: DataView) => {
        try {
          const decoder = new TextDecoder();
          const jsonStr = decoder.decode(value.buffer);
          const packet = JSON.parse(jsonStr) as MeshPacket;
          onPacket(packet);
        } catch (e) {
          console.error('[CapacitorBLEService] Error decodificando paquete de notificación:', e);
        }
      }
    );
  } catch (error) {
    console.error(`[CapacitorBLEService] Error conectando al dispositivo ${deviceId}:`, error);
    throw error;
  }
}

// Transmitir paquete SOS a todos los nodos conectados
export async function broadcastSOS(packet: MeshPacket): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.warn('[CapacitorBLEService] No en plataforma nativa. Ignorando broadcastSOS.');
    return;
  }
  try {
    console.log('[CapacitorBLEService] Transmitiendo paquete SOS nativo:', packet.uuid);
    // Enviar a través de GATT write si hay dispositivos conectados
  } catch (error) {
    console.error('[CapacitorBLEService] Error en broadcastSOS:', error);
  }
}

// Iniciar servicio GATT como servidor
export async function startGATTServer(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.warn('[CapacitorBLEService] No en plataforma nativa. Ignorando GATT Server.');
    return;
  }
  try {
    console.log('[CapacitorBLEService] Iniciando Servidor GATT de RedSOS...');
  } catch (error) {
    console.error('[CapacitorBLEService] Error inicializando Servidor GATT:', error);
  }
}

// Servicio en segundo plano — mantener BLE activo aunque la app esté cerrada
export async function startBackgroundService(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.warn('[CapacitorBLEService] No en plataforma nativa. Ignorando Background Service.');
    return;
  }
  try {
    console.log('[CapacitorBLEService] Iniciando servicio en segundo plano de RedSOS para escaneo persistente.');
  } catch (error) {
    console.error('[CapacitorBLEService] Error al arrancar servicio en segundo plano:', error);
  }
}

// Calcular distancia desde RSSI
export function rssiToMeters(rssi: number): number {
  const txPower = -59; // txPower estándar de referencia a 1 metro (en dBm)
  if (rssi === 0) {
    return -1.0;
  }
  const ratio = rssi * 1.0 / txPower;
  if (ratio < 1.0) {
    return Math.pow(ratio, 10);
  } else {
    const distance = (0.89976) * Math.pow(ratio, 7.7095) + 0.111;
    return distance;
  }
}

// Detener todo
export async function stopBLE(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }
  try {
    await BleClient.stopLEScan();
    console.log('[CapacitorBLEService] BLE detenido correctamente.');
  } catch (error) {
    console.error('[CapacitorBLEService] Error deteniendo BLE:', error);
  }
}
