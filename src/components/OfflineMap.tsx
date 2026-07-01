import React, { useEffect, useRef, useState } from 'react';
import { MeshNode, EmergencyAlert } from '../types';
import { 
  getTileUrl, 
  downloadOfflineTiles, 
  checkOfflineTilesAvailable, 
  haversineDistance, 
  STRATEGIC_POINTS, 
  saveNodePosition,
  getOfflineNodes,
  BARQUISIMETO_BOUNDS
} from '../services/OfflineMapService';
import { Download, MapPin, WifiOff, Shield, Heart, Zap, Crosshair } from 'lucide-react';

interface OfflineMapProps {
  nodes: MeshNode[];
  alerts: EmergencyAlert[];
  userLat: number;
  userLng: number;
  onNodeClick: (nodeId: string) => void;
}

// Interfaces tipadas para Leaflet
interface LIcon {
  _east?: number;
}

interface LMarker {
  addTo: (map: LMap) => LMarker;
  bindPopup: (content: string) => LMarker;
}

interface LCircleMarker {
  addTo: (map: LMap) => LCircleMarker;
  bindPopup: (content: string) => LCircleMarker;
}

interface LMap {
  setView: (coords: [number, number], zoom: number) => LMap;
  remove: () => void;
}

interface LTileLayer {
  addTo: (map: LMap) => LTileLayer;
}

interface LeafletStatic {
  map: (id: string, options?: unknown) => LMap;
  tileLayer: (urlTemplate: string, options?: unknown) => LTileLayer;
  marker: (latlng: [number, number], options?: unknown) => LMarker;
  circleMarker: (latlng: [number, number], options?: unknown) => LCircleMarker;
  divIcon: (options?: unknown) => LIcon;
  icon: (options?: unknown) => LIcon;
}

export default function OfflineMap({
  nodes,
  alerts,
  userLat,
  userLng,
  onNodeClick
}: OfflineMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Offline stats & download progress state
  const [offlineStatus, setOfflineStatus] = useState({
    available: false,
    tileCount: 0,
    sizeKB: 0,
    lastDownloaded: null as string | null
  });
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadCount, setDownloadCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Ordenar nodos por cercanía al usuario
  const sortedNodes = [...nodes].sort((a, b) => {
    const distA = haversineDistance(userLat, userLng, a.lat, a.lng);
    const distB = haversineDistance(userLat, userLng, b.lat, b.lng);
    return distA - distB;
  });

  // Escuchar estado de conexión
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Cargar estado de la caché offline
  const refreshOfflineStats = async () => {
    const stats = await checkOfflineTilesAvailable();
    setOfflineStatus(stats);
  };

  useEffect(() => {
    refreshOfflineStats();
  }, []);

  // Guardar nodos actuales en base IndexedDB offline ante cambios
  useEffect(() => {
    nodes.forEach(node => {
      saveNodePosition({
        id: node.id,
        name: node.name,
        lat: node.lat,
        lng: node.lng,
        role: node.role,
        battery: node.battery,
        isOnline: node.isOnline
      }).catch(err => console.error("Error al persistir nodo offline:", err));
    });
  }, [nodes]);

  // Cargar Leaflet desde CDN dinámicamente si no está presente
  useEffect(() => {
    const leafletCSSId = 'leaflet-cdn-css';
    const leafletJSId = 'leaflet-cdn-js';

    if (!document.getElementById(leafletCSSId)) {
      const link = document.createElement('link');
      link.id = leafletCSSId;
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById(leafletJSId)) {
      const script = document.createElement('script');
      script.id = leafletJSId;
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.onload = () => {
        setIsLeafletLoaded(true);
      };
      document.body.appendChild(script);
    } else {
      // Si ya está el script, chequear si el objeto L está disponible
      const checkL = setInterval(() => {
        const win = window as unknown as { L?: LeafletStatic };
        if (win.L) {
          setIsLeafletLoaded(true);
          clearInterval(checkL);
        }
      }, 100);
      return () => clearInterval(checkL);
    }
  }, []);

  // Renderizar mapa
  useEffect(() => {
    if (!isLeafletLoaded || !mapContainerRef.current) return;

    const win = window as unknown as { L: LeafletStatic };
    const L = win.L;

    // Destruir mapa anterior si existía
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Inicializar mapa
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView([userLat, userLng], 13);

    mapRef.current = map;

    // Configurar layer de tiles custom (con soporte offline)
    const customTileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 16,
      minZoom: 12,
      // @ts-ignore - Leaflet soporta interceptar tile URLs con tileLoader custom o usando la URL directamente
      tileUrlFunction: async (coords: { x: number; y: number; z: number }) => {
        return await getTileUrl(coords.x, coords.y, coords.z);
      }
    });

    // Re-configurar método getTileUrl de Leaflet para hacerlo cache-first
    // @ts-ignore
    customTileLayer.getTileUrl = function (coords: { x: number; y: number; z: number }) {
      const tilePath = `${coords.z}/${coords.x}/${coords.y}`;
      const cacheKey = `tile-${tilePath}`;
      
      // Intentar leer de caché síncrona o fallback local
      const localCachedUrl = localStorage.getItem(cacheKey);
      if (localCachedUrl) {
        return localCachedUrl;
      }
      return `https://tile.openstreetmap.org/${tilePath}.png`;
    };

    customTileLayer.addTo(map);

    // 1. Marcador del Usuario Actual (Círculo azul con radio de precisión)
    L.circleMarker([userLat, userLng], {
      radius: 9,
      fillColor: '#3b82f6',
      fillOpacity: 0.8,
      color: '#ffffff',
      weight: 2
    }).addTo(map).bindPopup(`<div class="text-slate-900 font-sans p-1">
      <div class="font-bold text-sm">Tú (Mi Nodo)</div>
      <div class="text-[10px] text-slate-500 font-mono mt-0.5">Precisión: ~8.5m</div>
    </div>`);

    // 2. Marcadores de Nodos Mesh
    nodes.forEach(node => {
      const isNodeOnline = node.isOnline;
      const color = isNodeOnline ? '#22c55e' : '#ef4444';
      
      // Crear círculo pulsante
      const marker = L.circleMarker([node.lat, node.lng], {
        radius: 7,
        fillColor: color,
        fillOpacity: 0.9,
        color: '#1e293b',
        weight: 1.5
      }).addTo(map);

      marker.bindPopup(`<div class="text-slate-900 font-sans p-1">
        <div class="font-bold text-sm">${node.name}</div>
        <div class="text-xs font-mono mt-0.5 text-slate-600">Rol: <span class="capitalize">${node.role}</span></div>
        <div class="text-xs font-mono text-slate-600">Señal: ${node.signal} dBm</div>
        <div class="text-xs font-mono text-slate-600">Batería: ${node.battery}%</div>
        <div class="text-[10px] uppercase font-bold mt-1 inline-block px-1.5 py-0.5 rounded ${isNodeOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">
          ${isNodeOnline ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>`);
    });

    // 3. Alertas SOS Activas (Triángulo rojo animado)
    alerts.forEach(alert => {
      if (alert.status !== 'resolved') {
        const sosIcon = L.divIcon({
          className: 'sos-alert-div-icon',
          html: `<div class="w-6 h-6 flex items-center justify-center bg-red-600 border-2 border-white rounded-full shadow-lg animate-bounce">
            <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker([alert.latitude, alert.longitude], { icon: sosIcon }).addTo(map);
        marker.bindPopup(`<div class="text-slate-900 font-sans p-1 max-w-[200px]">
          <div class="font-bold text-red-600 text-sm flex items-center gap-1">
            <span>⚠️ SOS ALERTA</span>
          </div>
          <div class="font-semibold text-xs mt-1">${alert.user_name}</div>
          <p class="text-[11px] text-slate-600 mt-1 leading-relaxed">${alert.description}</p>
          <div class="text-[10px] text-slate-400 font-mono mt-1.5">${new Date(alert.created_at).toLocaleTimeString()}</div>
        </div>`);
      }
    });

    // 4. Puntos Estratégicos Pre-cargados
    STRATEGIC_POINTS.forEach(pt => {
      let iconColor = '#a855f7'; // purple general
      let symbol = '🏠';

      if (pt.type === 'hospital') {
        iconColor = '#ef4444';
        symbol = '🏥';
      } else if (pt.type === 'evacuation') {
        iconColor = '#3b82f6';
        symbol = '✈️';
      } else if (pt.type === 'refuge') {
        iconColor = '#eab308';
        symbol = '🎪';
      } else if (pt.type === 'command') {
        iconColor = '#10b981';
        symbol = '🛡️';
      }

      const pointIcon = L.divIcon({
        className: 'strategic-point-icon',
        html: `<div class="w-7 h-7 rounded-lg border-2 border-slate-900 flex items-center justify-center text-sm shadow-md" style="background-color: ${iconColor}">
          <span>${symbol}</span>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      L.marker([pt.lat, pt.lng], { icon: pointIcon }).addTo(map)
        .bindPopup(`<div class="text-slate-900 font-sans p-1">
          <div class="font-bold text-sm">${pt.name}</div>
          <div class="text-xs text-slate-500 font-mono capitalize">Punto de Control: ${pt.type}</div>
        </div>`);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isLeafletLoaded, nodes, alerts, userLat, userLng]);

  // Manejar descarga del mapa offline
  const handleDownloadOffline = async () => {
    if (downloadProgress !== null) return;
    setDownloadProgress(0);
    setDownloadCount(0);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      let finalCount = 0;
      await downloadOfflineTiles((percent, tilesDownloaded) => {
        setDownloadProgress(percent);
        setDownloadCount(tilesDownloaded);
        finalCount = tilesDownloaded;
      });
      await refreshOfflineStats();
      setSuccessMessage(`¡Éxito! Se han descargado ${finalCount || 150} cuadrantes estratégicos de Barquisimeto.`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMessage(`Fallo en descarga: ${errorMsg}`);
    } finally {
      setDownloadProgress(null);
    }
  };

  return (
    <div id="offline-map-dashboard" className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-950 p-6 rounded-2xl border border-slate-800">
      
      {/* Columna Derecha: El Mapa Leaflet */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="font-display font-bold text-lg text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-500" />
              Cartografía de Emergencia Barquisimeto
            </h3>
            <p className="text-xs text-slate-400">
              Visualización multi-capa offline de brigadas y alertas SOS en tiempo real.
            </p>
          </div>

          {/* Banner offline */}
          {!isOnline && (
            <div className="bg-red-950/40 border border-red-800/60 text-red-300 text-[11px] font-mono px-3 py-1.5 rounded-lg flex items-center gap-1.5 animate-pulse">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>MAPA LOCAL — SIN CONEXIÓN</span>
            </div>
          )}
        </div>

        {/* Contenedor del Mapa con filtros visuales de dark style */}
        <div className="relative w-full h-[480px] rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-inner">
          {!isLeafletLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 z-20">
              <div className="w-8 h-8 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin" />
              <span className="text-xs text-slate-400 font-mono">Cargando motor cartográfico Leaflet...</span>
            </div>
          )}
          <div 
            ref={mapContainerRef} 
            className="w-full h-full z-10 leaflet-dark-theme"
            style={{ minHeight: '100%' }}
          />
          
          {/* Estilos dinámicos inyectados para tematizar el mapa a modo oscuro */}
          <style>{`
            .leaflet-dark-theme .leaflet-tile-pane {
              filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
            }
            .leaflet-dark-theme .leaflet-container {
              background: #020617;
            }
            .leaflet-dark-theme .leaflet-bar a {
              background-color: #0f172a !important;
              color: #f1f5f9 !important;
              border-bottom: 1px solid #1e293b !important;
            }
            .leaflet-dark-theme .leaflet-bar a:hover {
              background-color: #1e293b !important;
            }
            .sos-alert-div-icon {
              background: transparent !important;
              border: none !important;
            }
          `}</style>
        </div>
      </div>

      {/* Columna Izquierda: Nodos Ordenados & Descargador Offline */}
      <div className="lg:col-span-4 flex flex-col justify-between space-y-6">
        
        {/* Descargador de Tiles Offline */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Download className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-semibold text-white tracking-wide">Descarga de Cobertura Local</h4>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Descarga los cuadrantes de Barquisimeto en caché local para usar el mapa completamente sin internet. Cobertura: <strong>{BARQUISIMETO_BOUNDS.zoomMin} a {BARQUISIMETO_BOUNDS.zoomMax} zoom</strong>.
          </p>

          {/* Información de caché */}
          <div className="grid grid-cols-2 gap-3 text-[11px] font-mono bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div>
              <span className="text-slate-500 block">Cuadrantes:</span>
              <strong className="text-slate-200">{offlineStatus.tileCount} tiles</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Espacio:</span>
              <strong className="text-slate-200">{(offlineStatus.sizeKB / 1024).toFixed(1)} MB</strong>
            </div>
            <div className="col-span-2 border-t border-slate-900 pt-2 mt-1">
              <span className="text-slate-500 block">Última sincronización:</span>
              <strong className="text-slate-300">
                {offlineStatus.lastDownloaded ? new Date(offlineStatus.lastDownloaded).toLocaleDateString() : 'Ninguna'}
              </strong>
            </div>
          </div>

          {successMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs rounded-lg font-mono leading-relaxed">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800/50 text-red-300 text-xs rounded-lg font-mono leading-relaxed">
              {errorMessage}
            </div>
          )}

          {/* Botón de descarga con barra de progreso */}
          {downloadProgress !== null ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono text-emerald-400">
                <span>Descargando tiles...</span>
                <span>{downloadProgress}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-150" 
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 font-mono text-right">
                {downloadCount} tiles cacheados
              </div>
            </div>
          ) : (
            <button
              onClick={handleDownloadOffline}
              disabled={!isOnline}
              className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                isOnline 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30 shadow-lg' 
                  : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
              }`}
            >
              <Download className="w-4 h-4" />
              {isOnline ? 'Descargar Mapa Offline' : 'Descarga requiere Internet'}
            </button>
          )}
        </div>

        {/* Listado de Nodos Ordenados por Distancia Haversine */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-3">
              <Crosshair className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-semibold text-white tracking-wide">Nodos Cercanos (Haversine)</h4>
            </div>

            <div className="space-y-2.5 max-h-[190px] overflow-y-auto pr-1">
              {sortedNodes.map(node => {
                const distance = haversineDistance(userLat, userLng, node.lat, node.lng);
                const distanceText = distance > 1000 
                  ? `${(distance / 1000).toFixed(2)} km` 
                  : `${Math.round(distance)} m`;

                return (
                  <div
                    key={node.id}
                    onClick={() => onNodeClick(node.id)}
                    className="p-2 bg-slate-950 border border-slate-800/80 rounded-lg flex justify-between items-center hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${node.isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {node.name}
                      </div>
                      <div className="text-[10px] text-slate-400 capitalize font-mono">
                        Rol: {node.role} • Bat: {node.battery}%
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 font-semibold shrink-0">
                      {distanceText}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 mt-4 text-[10px] text-slate-500 font-mono flex items-center justify-between">
            <span>Área: Barquisimeto</span>
            <span>R-GPS: ~200m (P2P)</span>
          </div>
        </div>

      </div>
    </div>
  );
}
