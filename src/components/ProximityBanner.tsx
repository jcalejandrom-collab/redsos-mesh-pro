import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  subscribeToProximityAlerts, 
  NearbyAlert, 
  markAsHelping, 
  getHelpersCount, 
  requestNotificationPermission, 
  sendProximityNotification 
} from '../services/ProximityAlertService';
import { triggerNativeAlert } from '../services/AlertSoundService';
import { openGoogleMapsRoute, openNativeNavigation, getNavigationSummary } from '../services/NavigationService';
import { AlertTriangle, MapPin, PhoneCall, Check, X, Shield, Clock, Eye, Navigation, Bike, Footprints, Car } from 'lucide-react';

interface ProximityBannerProps {
  userLat: number;
  userLng: number;
  userId: string;
  userName: string;
  onSelectTab?: (tab: 'map' | 'offlinemap' | 'sos' | 'chat' | 'brigade' | 'incidents' | 'cameras' | 'sim' | 'advanced' | 'docs' | 'admin' | 'storeforward' | 'tactical') => void;
}

const ALERT_CATEGORIES = {
  medical: { label: 'Médica', colorBg: 'bg-red-950 border-red-500 text-red-100', accentText: 'text-red-400', icon: '🏥', ringColor: 'ring-red-500' },
  rescue: { label: 'Rescate', colorBg: 'bg-orange-950 border-orange-500 text-orange-100', accentText: 'text-orange-400', icon: '🆘', ringColor: 'ring-orange-500' },
  fire: { label: 'Incendio', colorBg: 'bg-red-900 border-red-600 text-white animate-pulse', accentText: 'text-red-300', icon: '🔥', ringColor: 'ring-red-600' },
  general: { label: 'General', colorBg: 'bg-amber-950 border-amber-500 text-amber-100', accentText: 'text-amber-400', icon: '⚠️', ringColor: 'ring-amber-500' }
};

// Generar tono sutil de alerta vía Web Audio API para no requerir un archivo estático
function playAlertTone() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // Primer pitido
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // Nota La (A5)
    gain1.gain.setValueAtTime(0.0, ctx.currentTime);
    gain1.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.4);

    // Segundo pitido ligeramente más agudo
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.5, ctx.currentTime); // Nota Do (C6)
      gain2.gain.setValueAtTime(0.0, ctx.currentTime);
      gain2.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.4);
    }, 180);

  } catch (e) {
    // Ignorar si el audio está bloqueado por políticas del navegador
  }
}

export default function ProximityBanner({
  userLat,
  userLng,
  userId,
  userName,
  onSelectTab
}: ProximityBannerProps) {
  const [alerts, setAlerts] = useState<NearbyAlert[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Record<string, number>>({});
  const [helpersCounts, setHelpersCounts] = useState<Record<string, number>>({});
  const [selectedAlertForNav, setSelectedAlertForNav] = useState<NearbyAlert | null>(null);
  const [currentAlertIndex, setCurrentAlertIndex] = useState<number>(0);
  const [routeToast, setRouteToast] = useState<string | null>(null);

  // Suscribirse a alertas cercanas (1km)
  useEffect(() => {
    if (!userLat || !userLng) return;

    const unsubscribe = subscribeToProximityAlerts(
      userLat,
      userLng,
      1000, // 1 km
      (newAlert) => {
        // Ignorar si es nuestra propia alerta
        if (newAlert.userId === userId) {
          return;
        }

        // Evitar duplicados por sesión usando sessionStorage
        const processedKey = `redsos_processed_alert_${newAlert.id}`;
        if (sessionStorage.getItem(processedKey)) {
          return;
        }
        sessionStorage.setItem(processedKey, 'true');

        // 1. Pedir permisos de notificaciones si no se tienen
        requestNotificationPermission();
        // 2. Enviar notificación push/local
        sendProximityNotification(newAlert);
        // 3. Activar vibración y sonido usando el servicio centralizado (con fallback a web)
        triggerNativeAlert({
          title: `¡SOS Emergencia! A ${Math.round(newAlert.distanceMeters)}m`,
          body: `${newAlert.userName}: ${newAlert.description}`,
          alertId: newAlert.id
        });
      },
      (updatedAlerts) => {
        // Filtrar las descartadas que aún no han cumplido su cooldown de 5 minutos
        const now = Date.now();
        const filtered = updatedAlerts.filter(alert => {
          const dismissedAt = dismissedIds[alert.id];
          if (dismissedAt && now - dismissedAt < 5 * 60 * 1000) {
            return false;
          }
          // Histeresis: si se aleja más de 1500m, ya no mostrar (para evitar fluctuaciones en el límite de 1km)
          if (alert.distanceMeters > 1500) {
            return false;
          }
          return true;
        });
        
        setAlerts(filtered);
        
        // Ajustar el índice si la lista cambió
        if (currentAlertIndex >= filtered.length) {
          setCurrentAlertIndex(Math.max(0, filtered.length - 1));
        }
      }
    );

    return unsubscribe;
  }, [userLat, userLng, dismissedIds, currentAlertIndex]);

  // Cargar periódicamente el contador de ayudantes para las alertas cercanas visibles
  useEffect(() => {
    if (alerts.length === 0) return;

    const fetchHelpers = async () => {
      const counts: Record<string, number> = {};
      for (const alert of alerts) {
        counts[alert.id] = await getHelpersCount(alert.id);
      }
      setHelpersCounts(counts);
    };

    fetchHelpers();
    const interval = setInterval(fetchHelpers, 10000); // Actualizar cada 10s
    return () => clearInterval(interval);
  }, [alerts]);

  // Descartar temporalmente por 5 minutos
  const handleDismiss = (alertId: string) => {
    setDismissedIds(prev => ({
      ...prev,
      [alertId]: Date.now()
    }));
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  // Click en "Voy a ayudar" abre el panel modal del medio de transporte
  const handleHelpInit = (alert: NearbyAlert) => {
    setSelectedAlertForNav(alert);
  };

  // Ejecuta la navegación final tras elegir el modo de transporte
  const handleNavigate = async (mode: 'walking' | 'driving' | 'bicycling') => {
    if (!selectedAlertForNav) return;

    const alert = selectedAlertForNav;
    setSelectedAlertForNav(null);

    // 1. Registrar que va a ayudar en Firebase & Worker
    await markAsHelping(alert.id, userId, userName);

    // 2. Incrementar contador local inmediato
    setHelpersCounts(prev => ({
      ...prev,
      [alert.id]: (prev[alert.id] || 0) + 1
    }));

    // 3. Abrir Google Maps con la ruta
    const destination = {
      lat: alert.lat,
      lng: alert.lng,
      label: `Emergencia RedSOS - ${alert.userName}`
    };

    const isNative = /iPad|iPhone|iPod|android/i.test(navigator.userAgent);
    if (isNative) {
      await openNativeNavigation(destination, mode === 'bicycling' ? 'walking' : mode);
    } else {
      openGoogleMapsRoute({ lat: userLat, lng: userLng }, destination, mode);
    }

    setRouteToast(`Ruta en modo "${mode === 'walking' ? 'caminando' : mode === 'driving' ? 'vehículo' : 'bicicleta'}" abierta en Google Maps para asistir a ${alert.userName}`);
    setTimeout(() => {
      setRouteToast(null);
    }, 6000);
  };

  if (alerts.length === 0) return null;

  // Alerta actualmente mostrada en el banner rotativo
  const currentAlert = alerts[currentAlertIndex];
  if (!currentAlert) return null;

  const categoryInfo = ALERT_CATEGORIES[currentAlert.category] || ALERT_CATEGORIES.general;
  const helpersCount = helpersCounts[currentAlert.id] || 0;

  // Calcular tiempos aproximados para el selector
  const dist = currentAlert.distanceMeters;
  const walkingMin = Math.max(1, Math.round(dist / 1.38 / 60));
  const drivingMin = Math.max(1, Math.round(dist / 8.33 / 60));

  return (
    <div id="proximity-banners-container" className="fixed top-16 left-0 right-0 z-50 px-4 pointer-events-none flex flex-col items-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentAlert.id}
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="pointer-events-auto w-full max-w-lg shadow-2xl rounded-xl border overflow-hidden backdrop-blur-md"
        >
          {/* Banner Principal de Alerta */}
          <div className={`p-4 border-l-4 ${categoryInfo.colorBg} flex flex-col gap-3 relative`}>
            
            {/* Botón Cerrar */}
            <button
              id={`dismiss-alert-${currentAlert.id}`}
              onClick={() => handleDismiss(currentAlert.id)}
              className="absolute top-2 right-2 p-1 text-white/60 hover:text-white rounded-full hover:bg-white/10 transition-colors"
              title="Descartar por 5 minutos"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Cabecera */}
            <div className="flex items-start gap-3">
              <span className="text-2xl mt-0.5 animate-bounce">{categoryInfo.icon}</span>
              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tracking-wider uppercase bg-white/20 px-2 py-0.5 rounded-full">
                    {categoryInfo.label}
                  </span>
                  <span className="text-xs text-white/70 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {currentAlert.elapsedSeconds < 60 
                      ? 'Hace instantes' 
                      : `Hace ${Math.floor(currentAlert.elapsedSeconds / 60)} min`}
                  </span>
                </div>
                <h3 className="font-bold text-base mt-1 text-white flex items-center gap-1.5 flex-wrap">
                  <span>¡SOS a {Math.round(currentAlert.distanceMeters)}m hacia el {currentAlert.directionText}!</span>
                </h3>
                <p className="text-sm text-white/90 font-medium mt-1 italic line-clamp-2">
                  "{currentAlert.description}"
                </p>
                <p className="text-xs text-white/70 mt-1 flex items-center gap-1">
                  <span>Reportado por: {currentAlert.userName}</span>
                </p>
              </div>
            </div>

            {/* Estado de Ayuda Comunitaria */}
            {helpersCount > 0 && (
              <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-semibold">
                <Check className="w-4 h-4 animate-ping" />
                <span>{helpersCount} {helpersCount === 1 ? 'persona va' : 'personas van'} en camino a prestar auxilio</span>
              </div>
            )}

            {/* Panel de Múltiples Alertas (Controles de Navegación del Carrusel) */}
            {alerts.length > 1 && (
              <div className="flex items-center justify-between border-t border-white/15 pt-2 text-xs text-white/80">
                <span>⚠️ {alerts.length} alertas de emergencia activas cerca</span>
                <div className="flex items-center gap-2 pointer-events-auto">
                  <button 
                    onClick={() => setCurrentAlertIndex(prev => (prev - 1 + alerts.length) % alerts.length)}
                    className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded transition-colors"
                  >
                    Anterior
                  </button>
                  <span className="font-semibold">{currentAlertIndex + 1} / {alerts.length}</span>
                  <button 
                    onClick={() => setCurrentAlertIndex(prev => (prev + 1) % alerts.length)}
                    className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded transition-colors"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {/* Acciones principales */}
            <div className="grid grid-cols-3 gap-2 mt-1">
              <button
                id={`btn-help-${currentAlert.id}`}
                onClick={() => handleHelpInit(currentAlert)}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-white text-gray-900 hover:bg-gray-100 transition-all font-bold text-xs gap-1 shadow-md active:scale-95"
              >
                <Navigation className="w-4 h-4 text-emerald-600 animate-pulse" />
                <span>Voy a ayudar</span>
              </button>

              <button
                id={`btn-view-map-${currentAlert.id}`}
                onClick={() => {
                  localStorage.setItem('redsos_center_lat', String(currentAlert.latitude));
                  localStorage.setItem('redsos_center_lng', String(currentAlert.longitude));
                  localStorage.setItem('redsos_center_alert_id', currentAlert.id);
                  if (onSelectTab) {
                    onSelectTab('map');
                  }
                }}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all font-semibold text-xs gap-1 border border-white/10 active:scale-95"
              >
                <MapPin className="w-4 h-4 text-sky-400" />
                <span>Ver en mapa</span>
              </button>

              <a
                id={`btn-call-authorities-${currentAlert.id}`}
                href={`tel:911`}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all font-semibold text-xs gap-1 border border-white/10 active:scale-95 text-center"
              >
                <PhoneCall className="w-4 h-4 text-amber-400" />
                <span>Avisar 911</span>
              </a>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Selector de modo de transporte flotante tipo Modal */}
      <AnimatePresence>
        {selectedAlertForNav && (
          <div className="fixed inset-0 z-50 pointer-events-auto flex items-center justify-center bg-black/70 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 w-full max-w-sm text-center shadow-2xl flex flex-col gap-4 text-white"
            >
              <div className="flex justify-between items-start">
                <div className="text-left">
                  <h4 className="font-bold text-lg text-emerald-400 flex items-center gap-1.5">
                    <Shield className="w-5 h-5 text-emerald-500 animate-pulse" />
                    ¿Cómo llegarás al SOS?
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Ruta hacia la ubicación de {selectedAlertForNav.userName}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedAlertForNav(null)}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  id="mode-walk"
                  onClick={() => handleNavigate('walking')}
                  className="flex items-center gap-3 w-full p-3 bg-gray-800 hover:bg-emerald-950/40 hover:border-emerald-500/50 border border-transparent rounded-lg text-left transition-all group active:scale-98"
                >
                  <div className="bg-emerald-500/10 p-2 rounded text-emerald-400 group-hover:bg-emerald-500/25">
                    <Footprints className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm">Caminando (A pie)</p>
                    <p className="text-xs text-gray-400">Estimado: ~{walkingMin} min ({Math.round(currentAlert.distanceMeters)}m)</p>
                  </div>
                </button>

                <button
                  id="mode-drive"
                  onClick={() => handleNavigate('driving')}
                  className="flex items-center gap-3 w-full p-3 bg-gray-800 hover:bg-emerald-950/40 hover:border-emerald-500/50 border border-transparent rounded-lg text-left transition-all group active:scale-98"
                >
                  <div className="bg-emerald-500/10 p-2 rounded text-emerald-400 group-hover:bg-emerald-500/25">
                    <Car className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm">En vehículo (Móvil/Moto)</p>
                    <p className="text-xs text-gray-400">Estimado: ~{drivingMin} min ({Math.round(currentAlert.distanceMeters)}m)</p>
                  </div>
                </button>

                <button
                  id="mode-bike"
                  onClick={() => handleNavigate('bicycling')}
                  className="flex items-center gap-3 w-full p-3 bg-gray-800 hover:bg-emerald-950/40 hover:border-emerald-500/50 border border-transparent rounded-lg text-left transition-all group active:scale-98"
                >
                  <div className="bg-emerald-500/10 p-2 rounded text-emerald-400 group-hover:bg-emerald-500/25">
                    <Bike className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm">En Bicicleta</p>
                    <p className="text-xs text-gray-400">Estimado: ~{Math.max(1, Math.round(walkingMin / 3))} min</p>
                  </div>
                </button>
              </div>

              <div className="bg-gray-950 p-2.5 rounded text-[10px] text-gray-400 flex items-start gap-1.5 text-left border border-gray-800">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Por favor mantén extrema precaución y actúa con responsabilidad. Si la situación es hostil, avisa a las autoridades competentes de inmediato.
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {routeToast && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            className="pointer-events-auto mt-3 w-full max-w-sm bg-slate-900 border border-emerald-500/30 text-emerald-300 p-3 rounded-lg text-xs font-semibold shadow-2xl flex items-center gap-2"
          >
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{routeToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
