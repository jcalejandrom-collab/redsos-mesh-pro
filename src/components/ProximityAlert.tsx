import React, { useEffect, useRef, useState } from 'react';
import { 
  NearbyAlert, 
  subscribeToNearbyAlerts, 
  markAsAttending, 
  markAsResolved,
  bearingToText
} from '../services/ProximityService';
import { 
  AlertTriangle, 
  Navigation, 
  CheckCircle, 
  Clock, 
  Battery, 
  Shield, 
  MapPin, 
  ChevronDown, 
  ChevronUp, 
  X,
  Bell
} from 'lucide-react';

interface ProximityAlertProps {
  userLat: number;
  userLng: number;
  userRole: 'user' | 'brigadist' | 'operator';
  adminToken?: string;
  inlineLayout?: boolean;
}

export default function ProximityAlert({
  userLat,
  userLng,
  userRole,
  adminToken,
  inlineLayout = false
}: ProximityAlertProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<NearbyAlert[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevAlertsLength = useRef(0);
  const radius = userRole === 'user' ? 500 : 2000; // 500m para civiles, 2km para brigadistas

  // Pedir permiso de notificaciones push
  const requestNotificationPermission = async () => {
    if (typeof Notification !== 'undefined') {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
    }
  };

  // Suscripción a alertas de proximidad
  useEffect(() => {
    const cleanup = subscribeToNearbyAlerts(
      userLat,
      userLng,
      radius,
      (newAlerts) => {
        // Filtrar resolved para la vista normal
        const activeOrAttending = newAlerts.filter(a => a.status !== 'resolved');
        
        // Si hay alertas nuevas, vibrar y notificar
        if (activeOrAttending.length > prevAlertsLength.current) {
          // Vibración táctil si está disponible
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try {
              navigator.vibrate([200, 100, 200, 100, 200]);
            } catch (e) {
              console.warn("Vibration not supported or block by user gesture");
            }
          }

          // Notificación Push si está en background o simplemente para alertar
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const newest = activeOrAttending[activeOrAttending.length - 1];
            new Notification('⚠️ SOS Cercano — RedSOS', {
              body: `${newest.userName}: ${newest.description} a ${newest.distanceMeters}m hacia el ${bearingToText(newest.directionDegrees)}`,
              icon: '/assets/redsos-icon.png', // Fallback opcional
              vibrate: [200, 100, 200]
            } as any);
          } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            requestNotificationPermission();
          }
        }
        
        setAlerts(activeOrAttending);
        prevAlertsLength.current = activeOrAttending.length;
      },
      4000
    );

    return cleanup;
  }, [userLat, userLng, radius]);

  // Dibujar Canvas Mini Mapa
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const draw = () => {
      // Limpiar canvas
      ctx.clearRect(0, 0, 200, 200);

      const cx = 100;
      const cy = 100;
      const outerR = 85;

      // Fondo del Radar
      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fill();

      // Anillos del Radar
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      
      // Anillo exterior
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.stroke();

      // Anillo medio
      ctx.beginPath();
      ctx.arc(cx, cy, outerR / 2, 0, Math.PI * 2);
      ctx.stroke();

      // Cruz cardinal
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(cx - outerR, cy);
      ctx.lineTo(cx + outerR, cy);
      ctx.moveTo(cx, cy - outerR);
      ctx.lineTo(cx, cy + outerR);
      ctx.stroke();

      // Textos Cardinales
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('N', cx, cy - outerR - 4);
      ctx.fillText('S', cx, cy + outerR + 10);
      ctx.fillText('O', cx - outerR - 6, cy + 3);
      ctx.fillText('E', cx + outerR + 6, cy + 3);

      // Dibujar rango de cobertura
      ctx.fillStyle = 'rgba(16, 185, 129, 0.04)';
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fill();

      // Centro (Usuario actual) - Círculo azul y anillo pulsante
      const pulseUser = 1 + 0.2 * Math.sin(Date.now() / 250);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.beginPath();
      ctx.arc(cx, cy, 10 * pulseUser, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.stroke();

      // Dibujar Alertas
      alerts.forEach(alert => {
        // Escalar la distancia al rango de radar
        // 85 pixeles = radius (500m o 2000m)
        const distanceRatio = Math.min(1, alert.distanceMeters / radius);
        const distancePx = distanceRatio * outerR;

        // Convertir dirección grados a radianes (0=Norte, 90=Este...)
        // En canvas 0 es derecha, por eso ajustamos con -90 grados
        const bearingRad = (alert.directionDegrees - 90) * Math.PI / 180;
        const ax = cx + distancePx * Math.cos(bearingRad);
        const ay = cy + distancePx * Math.sin(bearingRad);

        // Pulso de alerta
        const pulse = 1 + 0.4 * Math.sin((Date.now() - (alert.id.charCodeAt(0) * 100)) / 150);
        
        if (alert.status === 'attending') {
          // Ámbar para en camino
          ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
          ctx.beginPath();
          ctx.arc(ax, ay, 8 * pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(ax, ay, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Rojo para activo sin atender
          ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
          ctx.beginPath();
          ctx.arc(ax, ay, 9 * pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(ax, ay, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Borde blanco para contraste
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ax, ay, 4, 0, Math.PI * 2);
        ctx.stroke();
      });

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [alerts, radius]);

  // Manejar acción Atender
  const handleAttend = async (alertId: string) => {
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const operatorName = userRole === 'operator' ? 'Operador de Guardia RedSOS' : 'Brigadista RedSOS';
      await markAsAttending(alertId, operatorName, adminToken);
      setSuccessMessage('✓ Te has asignado esta emergencia. El afectado está siendo notificado.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(`Error al atender alerta: ${err.message}`);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  // Manejar acción Resolver
  const handleResolve = async (alertId: string) => {
    if (!window.confirm('¿Confirmas que la emergencia ha sido controlada y resuelta?')) return;
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      await markAsResolved(alertId, adminToken);
      setSuccessMessage('✓ Emergencia marcada como RESUELTA.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(`Error al resolver alerta: ${err.message}`);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const renderBanners = () => (
    <>
      {successMessage && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs rounded-lg font-mono text-center animate-pulse">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="p-3 bg-red-950/40 border border-red-800/50 text-red-300 text-xs rounded-lg font-mono text-center">
          {errorMessage}
        </div>
      )}
    </>
  );

  if (alerts.length === 0 && !inlineLayout) return null;

  if (inlineLayout) {
    return (
      <div id="tactical-radar-inline" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar Map Column */}
        <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 shadow-xl flex flex-col items-center justify-between space-y-4">
          <div className="text-center w-full">
            <h3 className="font-display font-bold text-slate-100 flex items-center justify-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Radar de Cobertura RedSOS
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Escaneando señales Bluetooth y WiFi Direct en radio de {radius}m
            </p>
          </div>

          <div className="relative bg-slate-950 p-4 rounded-full border border-slate-800">
            <canvas 
              ref={canvasRef} 
              width={200} 
              height={200} 
              className="w-[180px] h-[180px]"
            />
            {alerts.length > 0 && (
              <div className="absolute top-2 right-2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </div>
            )}
          </div>

          <div className="text-[10px] text-slate-500 font-mono text-center leading-relaxed">
            Coordenadas Centrales: {userLat.toFixed(5)}° N, {userLng.toFixed(5)}° O <br/>
            Señales procesadas: {alerts.length} SOS activas
          </div>
        </div>

        {/* Actionable Alerts Column */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-700/60 rounded-xl p-5 shadow-xl flex flex-col space-y-4">
          <h3 className="font-display font-bold text-slate-100 border-b border-slate-800 pb-2 flex justify-between items-center">
            <span>Alertas de Emergencia SOS Detectadas ({alerts.length})</span>
            <span className="text-[10px] font-mono text-slate-400">Filtrando: {userRole === 'user' ? 'Civiles (500m)' : 'Táctico (2km)'}</span>
          </h3>

          {renderBanners()}

          {alerts.length === 0 ? (
            <div className="text-center py-16 bg-slate-950/40 border border-slate-800/60 rounded-xl flex-1 flex flex-col justify-center">
              <CheckCircle className="w-12 h-12 text-emerald-500/30 mx-auto mb-3 stroke-1" />
              <p className="text-sm text-slate-300 font-bold">Área Segura y Silenciosa</p>
              <p className="text-xs text-slate-500 px-12 mt-1">
                No se han interceptado transmisiones de auxilio activas en el radio táctico de cobertura de {radius} metros.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto max-h-[450px]">
              {alerts.map((alert) => {
                const isActive = alert.status === 'active';
                return (
                  <div 
                    key={alert.id}
                    className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                      isActive 
                        ? 'bg-red-950/25 border-red-900/40 text-red-200' 
                        : 'bg-amber-950/15 border-amber-900/30 text-amber-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-100 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
                          {alert.userName}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {alert.id.slice(0, 12)}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                        isActive ? 'bg-red-950 text-red-400 border border-red-900/40' : 'bg-amber-950 text-amber-400 border border-amber-900/30'
                      }`}>
                        {alert.distanceMeters}m {bearingToText(alert.directionDegrees)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-2.5 rounded border border-slate-900/80 italic">
                      "{alert.description}"
                    </p>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> hace {Math.round(alert.elapsedSeconds / 60)} min
                      </span>
                      <span className="flex items-center gap-1">
                        <Battery className="w-3.5 h-3.5 text-emerald-400" /> {alert.batteryLevel}% Bat
                      </span>
                    </div>

                    {userRole !== 'user' && (
                      <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-900">
                        {isActive ? (
                          <button
                            onClick={() => handleAttend(alert.id)}
                            className="bg-amber-600 hover:bg-amber-500 text-[#0f0a00] font-bold text-[10px] py-1.5 rounded text-center cursor-pointer"
                          >
                            ATENDER
                          </button>
                        ) : (
                          <button
                            disabled
                            className="bg-slate-850 text-slate-500 font-bold text-[10px] py-1.5 rounded text-center cursor-not-allowed"
                          >
                            EN PROCESO
                          </button>
                        )}
                        <button
                          onClick={() => handleResolve(alert.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] py-1.5 rounded text-center cursor-pointer"
                        >
                          RESOLVER
                        </button>
                        <a
                          href={`https://maps.google.com/?q=${alert.lat},${alert.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[10px] py-1.5 rounded text-center"
                        >
                          NAVEGAR
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      id="floating-proximity-alert-container"
      className="fixed bottom-6 right-6 z-50 max-w-sm w-[360px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300"
    >
      {/* Header flotante */}
      <div className={`p-3.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider select-none ${
        alerts.some(a => a.status === 'active') 
          ? 'bg-red-950/90 text-red-200 border-b border-red-800/40' 
          : 'bg-amber-950/90 text-amber-200 border-b border-amber-800/40'
      }`}>
        <div className="flex items-center gap-1.5 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span>{alerts.length} SOS CERCANO{alerts.length > 1 ? 'S' : ''} ({userRole === 'user' ? '500m' : '2km'})</span>
        </div>
        <div className="flex items-center gap-2">
          {notifPermission !== 'granted' && (
            <button 
              onClick={requestNotificationPermission}
              title="Permitir Notificaciones" 
              className="p-1 hover:bg-slate-800/60 rounded text-slate-400"
            >
              <Bell className="w-3.5 h-3.5" />
            </button>
          )}
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-slate-800/60 rounded"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4 max-h-[380px] overflow-y-auto">
          {renderBanners()}
          
          {/* El Canvas Radar */}
          <div className="flex justify-center bg-slate-950/80 p-2 rounded-xl border border-slate-800/80">
            <div className="relative">
              <canvas 
                ref={canvasRef} 
                width={200} 
                height={200} 
                className="w-[180px] h-[180px]"
              />
              <div className="absolute inset-0 border border-emerald-500/10 pointer-events-none rounded-full" />
            </div>
          </div>

          {/* VISTA CIUDADANO COMPACTA */}
          {userRole === 'user' && (
            <div className="space-y-2">
              {alerts.slice(0, 3).map((alert) => (
                <div 
                  key={alert.id}
                  className={`p-3 rounded-xl border text-xs transition-all ${
                    alert.status === 'attending'
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200'
                      : 'bg-red-950/20 border-red-900/30 text-red-200'
                  }`}
                >
                  <div className="flex justify-between font-bold items-center">
                    <span className="flex items-center gap-1">
                      ⚠️ SOS a {alert.distanceMeters}m
                    </span>
                    <span className="font-mono text-[10px] opacity-70">
                      Rumbo {bearingToText(alert.directionDegrees)}
                    </span>
                  </div>
                  
                  <p className="mt-1 text-[11px] text-slate-300 line-clamp-2 italic">
                    "{alert.description}"
                  </p>

                  <div className="mt-2 pt-1.5 border-t border-slate-800/40 flex justify-between items-center text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> hace {Math.round(alert.elapsedSeconds / 60)} min
                    </span>
                    {alert.status === 'attending' ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1 bg-emerald-950/60 px-1.5 py-0.5 rounded">
                        <CheckCircle className="w-3 h-3" /> Bomberos / Brigada en Camino
                      </span>
                    ) : (
                      <span className="text-red-400 font-bold bg-red-950/50 px-1.5 py-0.5 rounded">
                        Crítico (Sin Atender)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VISTA BRIGADISTA / OPERADOR ACCIONABLE */}
          {userRole !== 'user' && (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div 
                  key={alert.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-xs text-slate-100 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        {alert.userName}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <span>Afectado</span> • 
                        <span className="font-mono text-amber-500 flex items-center gap-0.5">
                          <Battery className="w-3 h-3 inline" /> {alert.batteryLevel}% Bat
                        </span>
                      </p>
                    </div>

                    <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 px-1.5 py-0.5 rounded">
                      {alert.distanceMeters}m {bearingToText(alert.directionDegrees)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-2 rounded border border-slate-800">
                    {alert.description}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" /> {Math.round(alert.elapsedSeconds / 60)}m transcurridos
                    </span>
                    <span className="capitalize font-semibold text-slate-300">
                      Canal: {alert.category}
                    </span>
                  </div>

                  {/* Botonera de acción táctica */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-900">
                    {alert.status === 'active' ? (
                      <button
                        onClick={() => handleAttend(alert.id)}
                        className="bg-amber-600 hover:bg-amber-500 text-[#0f0a00] font-bold text-[10px] py-1 px-1.5 rounded flex items-center justify-center gap-1 shadow cursor-pointer transition-colors"
                      >
                        <Shield className="w-3 h-3" />
                        ATENDER
                      </button>
                    ) : (
                      <button
                        disabled
                        className="bg-slate-800 text-slate-500 font-bold text-[10px] py-1 px-1.5 rounded flex items-center justify-center gap-1 cursor-not-allowed"
                      >
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                        EN PROCESO
                      </button>
                    )}

                    <button
                      onClick={() => handleResolve(alert.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] py-1 px-1.5 rounded flex items-center justify-center gap-1 shadow cursor-pointer transition-colors"
                    >
                      <CheckCircle className="w-3 h-3" />
                      RESOLVER
                    </button>

                    <a
                      href={`https://maps.google.com/?q=${alert.lat},${alert.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[10px] py-1 px-1.5 rounded flex items-center justify-center gap-1 border border-slate-700 transition-colors"
                    >
                      <Navigation className="w-3 h-3 text-sky-400" />
                      NAVEGAR
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
