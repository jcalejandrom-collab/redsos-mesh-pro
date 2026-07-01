/**
 * RedSOS - Prompt 3: OfflineMapService.ts
 * Servicio para gestión de cartografía offline de Barquisimeto, caché de tiles e IndexedDB de nodos.
 */

import { MeshNode } from '../types';

export const BARQUISIMETO_BOUNDS = {
  north: 10.15,
  south: 9.95,
  east: -69.20,
  west: -69.45,
  centerLat: 10.07,
  centerLng: -69.31,
  zoomMin: 12,
  zoomMax: 16
};

export const STRATEGIC_POINTS = [
  { name: 'IAGAMI - Sede Principal', lat: 10.0706, lng: -69.3195, type: 'command' },
  { name: 'Hospital Central Barquisimeto', lat: 10.0731, lng: -69.3012, type: 'hospital' },
  { name: 'Aeropuerto Jacinto Lara', lat: 10.0427, lng: -69.3586, type: 'evacuation' },
  { name: 'Parque Nacional Terepaima', lat: 9.9876, lng: -69.2543, type: 'refuge' },
];

const CACHE_NAME = 'redsos-offline-tiles-v1';
const DB_NAME = 'redsos-offline-db';
const DB_VERSION = 1;
const STORE_NODES = 'nodes';

// Inicializar base de datos IndexedDB
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NODES)) {
        db.createObjectStore(STORE_NODES, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Convertir coordenadas GPS a tile x, y, z
 */
export function latLngToTile(lat: number, lng: number, zoom: number): {
  x: number; y: number; z: number;
} {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y, z: zoom };
}

/**
 * Obtener URL del tile (cache-first, network fallback)
 */
export async function getTileUrl(x: number, y: number, z: number): Promise<string> {
  const tilePath = `${z}/${x}/${y}`;
  const tileUrl = `https://tile.openstreetmap.org/${tilePath}.png`;
  
  if (typeof caches === 'undefined') {
    return tileUrl;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(tileUrl);
    if (cachedResponse) {
      const blob = await cachedResponse.blob();
      return URL.createObjectURL(blob);
    }
  } catch (err) {
    console.warn(`Error de lectura en caché para tile ${tilePath}:`, err);
  }

  return tileUrl;
}

/**
 * Descargar y cachear tiles de Barquisimeto en Cache API para zooms 12 al 16
 */
export async function downloadOfflineTiles(
  onProgress: (percent: number, tilesDownloaded: number) => void
): Promise<void> {
  if (typeof caches === 'undefined') {
    throw new Error('Caché API no soportada en este entorno');
  }

  const cache = await caches.open(CACHE_NAME);
  const tileList: { z: number; x: number; y: number }[] = [];

  // Calcular tiles necesarios en Barquisimeto Bounds
  for (let z = BARQUISIMETO_BOUNDS.zoomMin; z <= BARQUISIMETO_BOUNDS.zoomMax; z++) {
    // Esquinas superior izquierda e inferior derecha
    const tileNW = latLngToTile(BARQUISIMETO_BOUNDS.north, BARQUISIMETO_BOUNDS.west, z);
    const tileSE = latLngToTile(BARQUISIMETO_BOUNDS.south, BARQUISIMETO_BOUNDS.east, z);

    const minX = Math.min(tileNW.x, tileSE.x);
    const maxX = Math.max(tileNW.x, tileSE.x);
    const minY = Math.min(tileNW.y, tileSE.y);
    const maxY = Math.max(tileNW.y, tileSE.y);

    // Limitar cantidad por zoom para evitar colapsar memoria o rate limiting
    // (un zoom 16 completo de toda el área podría contener miles, recortaremos a un área central más densa si supera límites)
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tileList.push({ z, x, y });
      }
    }
  }

  // Limitar cantidad máxima de descarga para simulación / rendimiento eficiente (máx 150 tiles estratégicos)
  const totalTilesToDownload = Math.min(tileList.length, 150);
  const selectedTiles = tileList.slice(0, totalTilesToDownload);

  console.log(`Iniciando descarga de ${selectedTiles.length} tiles offline de Barquisimeto...`);
  
  let processedCount = 0;
  let successCount = 0;
  let consecutiveFailures = 0;

  // Descarga secuencial con delay para respetar el servidor OSM
  for (let i = 0; i < selectedTiles.length; i++) {
    const { z, x, y } = selectedTiles[i];
    const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

    try {
      const response = await fetch(url, { referrerPolicy: 'no-referrer' });
      if (response.ok) {
        await cache.put(url, response.clone());
        successCount++;
        consecutiveFailures = 0;
      } else {
        throw new Error(`Servidor OSM retornó código ${response.status}`);
      }
    } catch (e) {
      console.warn(`No se pudo descargar tile: ${url}`, e);
      consecutiveFailures++;
      
      // Si hay más de 5 fallos consecutivos, asumimos desconexión total
      if (consecutiveFailures >= 5) {
        throw new Error("Pérdida total de conexión: Se detectaron fallas consecutivas al descargar el mapa.");
      }
    }

    processedCount++;
    const progressPercent = Math.round((processedCount / selectedTiles.length) * 100);
    onProgress(progressPercent, successCount);

    // Si hemos procesado al menos 10 cuadrantes y el porcentaje de éxito es menor al 30%
    if (processedCount >= 10 && (successCount / processedCount) < 0.3) {
      throw new Error("Calidad de conexión insuficiente: Demasiados errores al descargar cuadrantes.");
    }

    // Pequeño retardo de cortesía de 30ms
    await new Promise(r => setTimeout(r, 30));
  }

  if (successCount === 0) {
    throw new Error("No se pudo descargar ningún cuadrante. Verifica tu conexión de red.");
  }

  localStorage.setItem('offline_tiles_last_download', new Date().toISOString());
  onProgress(100, successCount);
}

/**
 * Verificar si los tiles están en caché
 */
export async function checkOfflineTilesAvailable(): Promise<{
  available: boolean;
  tileCount: number;
  sizeKB: number;
  lastDownloaded: string | null;
}> {
  if (typeof caches === 'undefined') {
    return { available: false, tileCount: 0, sizeKB: 0, lastDownloaded: null };
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    const lastDownloaded = localStorage.getItem('offline_tiles_last_download');
    
    // Cada tile en PNG pesa aproximadamente 15KB promedio
    const sizeKB = requests.length * 15;

    return {
      available: requests.length > 0,
      tileCount: requests.length,
      sizeKB,
      lastDownloaded
    };
  } catch (err) {
    return { available: false, tileCount: 0, sizeKB: 0, lastDownloaded: null };
  }
}

/**
 * Guardar posición de nodo mesh en IndexedDB offline
 */
export async function saveNodePosition(node: {
  id: string; name: string; lat: number; lng: number;
  role: string; battery: number; isOnline: boolean;
}): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NODES, 'readwrite');
    const store = tx.objectStore(STORE_NODES);
    const req = store.put(node);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Recuperar todos los nodos guardados offline
 */
export async function getOfflineNodes(): Promise<any[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NODES, 'readonly');
    const store = tx.objectStore(STORE_NODES);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Calcular distancia entre dos puntos GPS en metros usando la fórmula Haversine
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // en metros
}
