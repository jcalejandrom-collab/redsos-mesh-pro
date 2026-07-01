/**
 * RedSOS - Integrador: MeshOrchestrator.ts
 * Coordina las capacidades offline automáticamente eligiendo el mejor canal disponible.
 * Incluye detector sísmico simulado, linterna morse, mapa offline y envío paralelo en modo SEVERO.
 *
 * NOTA DE SEGURIDAD: los canales LoRa/Meshtastic (MeshtasticBridgeService.ts) y WiFi Direct
 * (WiFiDirectService.ts) NO están integrados a hardware real todavía — ambos servicios simulan
 * su comportamiento internamente. Por eso quedan deliberadamente fuera de la cadena de failover
 * de sendSOSOptimal()/startMeshMonitor(): incluirlos generaría falsos positivos de envío durante
 * una emergencia real sin internet. El código de ambos servicios permanece en el repo como
 * trabajo futuro, pero no debe invocarse desde este orquestador hasta tener integración real.
 */

import { Capacitor } from '@capacitor/core';
import * as CapacitorBLE from './CapacitorBLEService';
import { loadPrivateKey, signPacket, hashPacket } from './CryptoService';

import {
  MeshPacket,
  broadcastSOS,
  cachePacketLocally,
  getMeshStatus,
  syncCachedPackets
} from './BluetoothMeshService';
import {
  startSOSFlash,
  getFlashStatus,
  stopFlash
} from './FlashlightMorseService';
import {
  checkOfflineTilesAvailable
} from './OfflineMapService';

import { WORKER_URL as API_URL } from '../config';

export interface SeismicEvent {
  intensity: 'LOW' | 'MEDIUM' | 'SEVERE' | 'SEVERO';
  magnitude: number;
  timestamp: string;
}

export interface MeshLayerStatus {
  internet: boolean;
  loRa: { available: boolean; nodesNearby: number };
  nativeBLE: { available: boolean; peersConnected: number };
  webBluetooth: { available: boolean; peersConnected: number };
  wifiDirect: { available: boolean; peersConnected: number; throughputKBps: number };
  cachedPackets: number;
  optimalChannel: string;
  seismicDetector: { active: boolean; lastEvent: SeismicEvent | null };
  flashlight: { supported: boolean; isFlashing: boolean };
  offlineMap: { tilesAvailable: boolean; tileCount: number };
}

// Estado del Detector Sísmico Simulado
let isSeismicActive = false;
let lastSeismicEvent: SeismicEvent | null = null;
const seismicChangeListeners = new Set<(event: SeismicEvent | null) => void>();

/**
 * Registra un escuchador para cambios en el detector sísmico
 */
export function registerSeismicListener(listener: (event: SeismicEvent | null) => void): () => void {
  seismicChangeListeners.add(listener);
  return () => {
    seismicChangeListeners.delete(listener);
  };
}

/**
 * Trigger para simular un evento sísmico desde la UI
 */
export function triggerSimulatedSeismicEvent(intensity: 'LOW' | 'MEDIUM' | 'SEVERE' | 'SEVERO', magnitude: number): void {
  isSeismicActive = intensity === 'SEVERE' || intensity === 'SEVERO';
  lastSeismicEvent = {
    intensity,
    magnitude,
    timestamp: new Date().toISOString()
  };

  console.log(`[Detector Sísmico] Evento registrado: ${intensity} (M ${magnitude})`);
  
  // Notificar escuchadores
  seismicChangeListeners.forEach(listener => {
    try {
      listener(lastSeismicEvent);
    } catch (e) {
      console.error(e);
    }
  });

  // Si es SEVERO, ejecutar acciones automáticas especificadas
  if (intensity === 'SEVERE' || intensity === 'SEVERO') {
    // 1. Iniciar flashMorse('SOS') automáticamente
    startSOSFlash().catch(console.error);

    // 2. Notificar por canal de ventana global para cambiar mapa a vista de alertas
    const win = window as unknown as { onSeismicSevereTrigger?: () => void };
    if (win.onSeismicSevereTrigger) {
      try {
        win.onSeismicSevereTrigger();
      } catch (err) {
        console.error("Error al disparar trigger sísmico en UI:", err);
      }
    }
  }
}

/**
 * Detener simulación de sismo y limpiar señales ópticas
 */
export function clearSeismicSimulation(): void {
  isSeismicActive = false;
  lastSeismicEvent = null;
  stopFlash();
  seismicChangeListeners.forEach(listener => listener(null));
}

/**
 * Coordina y envía una alerta SOS seleccionando el canal óptimo según la disponibilidad real
 * Jerarquía de envío estándar (solo canales con integración de hardware/red real):
 * 1. Internet disponible → Cloudflare Worker (menor latencia)
 * 2. Native BLE disponible → CapacitorBLEService (brigadas, 100m)
 * 3. Web Bluetooth disponible → BluetoothMeshService (civiles, 30m)
 * 4. Todo falla → cachePacketLocally() y esperar handshake
 *
 * LoRa/Meshtastic y WiFi Direct quedan fuera de esta cadena hasta tener integración de
 * hardware real (ver nota de seguridad al inicio del archivo).
 *
 * Si la intensidad sísmica es SEVERO:
 * - Activar TODAS las capas reales simultáneamente en paralelo (usando Promise.allSettled)
 * - Iniciar flashMorse('SOS') automáticamente
 * - Cambiar mapa a vista de alertas activas
 */
export async function sendSOSOptimal(packet: MeshPacket): Promise<{
  sentVia: 'WEB_BLUETOOTH' | 'NATIVE_BLE' | 'INTERNET' | 'CACHED' | 'PARALELO_SEVERO';
  peersReached: number;
  estimatedRangeMeters: number;
  confirmationAvailable: boolean;
  note?: string;
}> {
  console.log(`[Orquestador Mesh] Evaluando canal óptimo para paquete SOS ${packet.uuid}`);

  // Firmar el paquete antes de enviarlo si hay PIN de brigadista
  const userPin = sessionStorage.getItem('redsos_brigadist_pin');
  if (userPin) {
    try {
      const privateKey = await loadPrivateKey(userPin);
      if (privateKey) {
        packet.signature = await signPacket(packet, privateKey);
        console.log('[Orquestador] Paquete firmado criptográficamente con Ed25519.');
      }
    } catch (e) {
      console.error('[Orquestador] Error al firmar paquete con Ed25519:', e);
    }
  }
  try {
    packet.hash = await hashPacket(packet);
  } catch (e) {
    console.error('[Orquestador] Error al calcular hash del paquete:', e);
  }

  const isNativeApp = Capacitor.isNativePlatform();

  // Verificar si hay una alerta de sismo SEVERO activa
  if (isSeismicActive || (lastSeismicEvent && (lastSeismicEvent.intensity === 'SEVERE' || lastSeismicEvent.intensity === 'SEVERO'))) {
    console.warn("[Orquestador] ¡SISMO SEVERO ACTIVO! Iniciando transmisión paralela en todas las capas simultáneamente...");
    
    // Iniciar flashMorse si no estuviera corriendo ya
    startSOSFlash().catch(console.error);

    // Ejecutar en paralelo todas las capas viables con Promise.allSettled para garantizar robustez
    const transmissions = [
      // Capa 1: Internet
      (async () => {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          const res = await fetch(`${API_URL}/api/alerts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: packet.uuid,
              user_name: packet.senderName,
              latitude: packet.payload.lat,
              longitude: packet.payload.lng,
              battery_level: packet.payload.battery,
              connection_type: 'hybrid',
              status: 'active',
              description: packet.payload.description,
              created_at: packet.payload.timestamp
            })
          });
          if (!res.ok) throw new Error("Fallo API Internet");
          return 'INTERNET';
        }
        throw new Error("Sin conexión a Internet");
      })(),

      // Capa 2: Native BLE
      (async () => {
        await CapacitorBLE.initNativeBLE();
        await CapacitorBLE.broadcastSOS(packet);
        return 'NATIVE_BLE';
      })(),

      // Capa 3: Web Bluetooth BLE
      (async () => {
        await broadcastSOS(packet);
        return 'WEB_BLUETOOTH';
      })()
    ];

    const results = await Promise.allSettled(transmissions);

    // Solo contamos peers de canales con confirmación real de entrega:
    // Internet (respuesta HTTP 2xx del Worker) y Web Bluetooth (conexiones GATT activas y trackeadas).
    // Native BLE (advertising) no tiene ACK, así que no suma a peersCount aquí.
    let peersCount = 0;
    let maxRange = 0;
    let bleSentWithoutConfirmation = false;
    results.forEach((res, index) => {
      if (res.status === 'fulfilled') {
        console.log(`[Orquestador] Canal [${index + 1}] enviado con éxito: ${res.value}`);
        if (index === 0) { // Internet
          peersCount += 1;
          maxRange = Math.max(maxRange, 99999);
        } else if (index === 1) { // Native BLE - sin ACK, no se cuenta como peer confirmado
          bleSentWithoutConfirmation = true;
          maxRange = Math.max(maxRange, 100);
        } else if (index === 2) { // Web Bluetooth
          peersCount += getMeshStatus().connectedPeers;
          maxRange = Math.max(maxRange, 30);
        }
      } else {
        console.warn(`[Orquestador] Canal [${index + 1}] falló en sismo severo: ${res.reason}`);
      }
    });

    // Sincronizar de todos modos a caché por seguridad si no hay confirmación exitosa de nada
    const anySuccess = results.some(r => r.status === 'fulfilled');
    if (!anySuccess) {
      cachePacketLocally(packet);
      return {
        sentVia: 'CACHED',
        peersReached: 0,
        estimatedRangeMeters: 0,
        confirmationAvailable: false
      };
    }

    return {
      sentVia: 'PARALELO_SEVERO',
      peersReached: peersCount,
      estimatedRangeMeters: maxRange,
      confirmationAvailable: peersCount > 0,
      note: bleSentWithoutConfirmation
        ? 'Incluye transmisión por Bluetooth nativo (confirmación de recepción no disponible).'
        : undefined
    };
  }

  // ---- FLUJO ESTÁNDAR DE JERARQUÍA ----

  // 1. Internet disponible -> Enviar al Cloudflare Worker
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      console.log("[Orquestador] Canal 1: INTERNET seleccionado. Enviando...");
      const res = await fetch(`${API_URL}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: packet.uuid,
          user_name: packet.senderName,
          latitude: packet.payload.lat,
          longitude: packet.payload.lng,
          battery_level: packet.payload.battery,
          connection_type: 'internet',
          status: 'active',
          description: packet.payload.description,
          created_at: packet.payload.timestamp
        })
      });

      if (res.ok) {
        syncCachedPackets().catch(console.error);
        return {
          sentVia: 'INTERNET',
          peersReached: 1,
          estimatedRangeMeters: 99999,
          confirmationAvailable: true
        };
      }
    } catch (e) {
      console.warn("[Orquestador] Fallo en Canal 1 (Internet), recurriendo a Canal 2 (Native BLE)...", e);
    }
  }

  // 2. Native BLE disponible -> CapacitorBLE
  // Nota: BLE advertising no tiene ACK — no hay forma de confirmar cuántos dispositivos
  // realmente recibieron el paquete, así que no inventamos una cifra.
  try {
    console.log("[Orquestador] Canal 2: Capacitor BLE seleccionado. Emitiendo...");
    await CapacitorBLE.initNativeBLE();
    await CapacitorBLE.broadcastSOS(packet);
    return {
      sentVia: 'NATIVE_BLE',
      peersReached: 0,
      estimatedRangeMeters: CapacitorBLE.rssiToMeters(-65),
      confirmationAvailable: false,
      note: 'Paquete transmitido por Bluetooth (confirmación de recepción no disponible).'
    };
  } catch (e) {
    console.warn("[Orquestador] Error en Canal 2 (Native BLE), recurriendo a Canal 3 (Web Bluetooth)...", e);
  }

  // 3. Web Bluetooth disponible -> BluetoothMeshService (Civiles, 30m)
  try {
    const webBtStatus = getMeshStatus();
    if (webBtStatus.isScanning) {
      console.log("[Orquestador] Canal 3: WEB_BLUETOOTH seleccionado. Propagando...");
      await broadcastSOS(packet);
      return {
        sentVia: 'WEB_BLUETOOTH',
        peersReached: webBtStatus.connectedPeers,
        estimatedRangeMeters: 30,
        confirmationAvailable: webBtStatus.connectedPeers > 0
      };
    }
  } catch (e) {
    console.warn("[Orquestador] Error en Canal 3 (Web Bluetooth)...", e);
  }

  // 4. Todo falla -> Guardar localmente en caché offline
  console.log("[Orquestador] No hay canales activos viables. Guardando en cola local offline...");
  cachePacketLocally(packet);
  return {
    sentVia: 'CACHED',
    peersReached: 0,
    estimatedRangeMeters: 0,
    confirmationAvailable: false
  };
}

/**
 * Monitor continuo del estado de todas las capas
 */
export function startMeshMonitor(
  onStatusChange: (status: MeshLayerStatus) => void
): void {
  const checkStatus = async () => {
    const internet = typeof navigator !== 'undefined' ? navigator.onLine : false;

    const webBt = getMeshStatus();
    const flashStatus = getFlashStatus();
    const isNative = Capacitor.isNativePlatform();

    let mapTilesCount = 0;
    let tilesAvailable = false;
    try {
      const stats = await checkOfflineTilesAvailable();
      mapTilesCount = stats.tileCount;
      tilesAvailable = stats.available;
    } catch (e) {}

    // Determinar el canal óptimo actual (solo canales con integración real)
    let optimalChannel = 'WEB_BLUETOOTH';
    if (internet) {
      optimalChannel = 'INTERNET (GLOBAL)';
    } else if (isNative) {
      optimalChannel = 'NATIVE BLE (BRIGADAS)';
    } else if (webBt.isScanning) {
      optimalChannel = 'WEB BLUETOOTH (CIVILES)';
    } else {
      optimalChannel = 'COLA LOCAL (CACHED)';
    }

    onStatusChange({
      internet,
      // LoRa y WiFi Direct sin integración de hardware real: siempre "no disponible"
      // hasta que MeshtasticBridgeService.ts / WiFiDirectService.ts se conecten a radios reales.
      loRa: { available: false, nodesNearby: 0 },
      nativeBLE: { available: isNative, peersConnected: 0 },
      webBluetooth: { available: webBt.isScanning, peersConnected: webBt.connectedPeers },
      wifiDirect: { available: false, peersConnected: 0, throughputKBps: 0 },
      cachedPackets: webBt.cachedPackets,
      optimalChannel,
      seismicDetector: { active: isSeismicActive, lastEvent: lastSeismicEvent },
      flashlight: { supported: flashStatus.torchSupported, isFlashing: flashStatus.isFlashing },
      offlineMap: { tilesAvailable, tileCount: mapTilesCount }
    });
  };

  // Ejecutar inmediatamente
  checkStatus();

  // Monitoreo recurrente cada 4 segundos
  const intervalId = setInterval(checkStatus, 4000);
}
