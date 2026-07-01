import React, { useState } from 'react';
import { MeshNode, EmergencyAlert } from '../types';
import { Radio, MapPin, Battery, AlertTriangle, Shield, CheckCircle2, Navigation, RefreshCw, X, CheckCircle, Heart, Clock } from 'lucide-react';
import { markAsAttending, markAsResolved, haversineDistance } from '../services/ProximityService';

interface NetworkMapProps {
  nodes: MeshNode[];
  alerts: EmergencyAlert[];
  userLat: number;
  userLng: number;
  onUpdateUserCoords: (lat: number, lng: number) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  isDesastreMode: boolean;
  userRole?: 'user' | 'brigadist' | 'operator';
  adminToken?: string;
  onAttendAlert?: (alertId: string) => void;
}

// Module-level cache to bridge coordinates/alert-id across React 18 StrictMode remounts
let sessionFocusCache: { lat: number | null; lng: number | null; alertId: string | null } | null = null;

export default function NetworkMap({
  nodes,
  alerts,
  userLat,
  userLng,
  onUpdateUserCoords,
  selectedNodeId,
  onSelectNode,
  isDesastreMode,
  userRole = 'user',
  adminToken,
  onAttendAlert
}: NetworkMapProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Map dimensions reference
  const mapWidth = 800;
  const mapHeight = 500;

  // Selected Alert Popup state
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  // Center coordinate of Barquisimeto, Venezuela for our mapping projection
  const mapCenterLat = 10.0735;
  const mapCenterLng = -69.3250;

  // Conversion scaling factors (degrees to pixels)
  // We want to map about 0.05 degrees latitude and longitude range onto the SVG size
  const scaleX = (lng: number) => {
    const diffLng = lng - mapCenterLng;
    return mapWidth / 2 + diffLng * 14000;
  };

  const scaleY = (lat: number) => {
    const diffLat = lat - mapCenterLat;
    return mapHeight / 2 - diffLat * 14000; // inverted Y axis for SVG
  };

  // Reverse projections to update user coordinates on map click
  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert pixels to lat/lng
    const lng = (x - mapWidth / 2) / 14000 + mapCenterLng;
    const lat = (mapHeight / 2 - y) / 14000 + mapCenterLat;

    onUpdateUserCoords(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
  };

  // Auto-center map to saved alert coordinates if clicked from proximity banner
  React.useEffect(() => {
    const savedLat = localStorage.getItem('redsos_center_lat');
    const savedLng = localStorage.getItem('redsos_center_lng');
    const savedAlertId = localStorage.getItem('redsos_center_alert_id');

    let currentLat = savedLat ? parseFloat(savedLat) : null;
    let currentLng = savedLng ? parseFloat(savedLng) : null;
    let currentAlertId = savedAlertId || null;

    if (currentLat !== null && currentLng !== null) {
      onUpdateUserCoords(currentLat, currentLng);
      // Store in session cache to survive StrictMode double-mounting
      sessionFocusCache = {
        lat: currentLat,
        lng: currentLng,
        alertId: currentAlertId || (sessionFocusCache ? sessionFocusCache.alertId : null)
      };
      localStorage.removeItem('redsos_center_lat');
      localStorage.removeItem('redsos_center_lng');
    } else if (sessionFocusCache?.lat !== null && sessionFocusCache?.lng !== null && sessionFocusCache?.lat !== undefined) {
      onUpdateUserCoords(sessionFocusCache.lat, sessionFocusCache.lng);
    }

    if (currentAlertId) {
      setSelectedAlertId(currentAlertId);
      // Store in session cache to survive StrictMode double-mounting
      sessionFocusCache = {
        lat: currentLat !== null ? currentLat : (sessionFocusCache ? sessionFocusCache.lat : null),
        lng: currentLng !== null ? currentLng : (sessionFocusCache ? sessionFocusCache.lng : null),
        alertId: currentAlertId
      };
      localStorage.removeItem('redsos_center_alert_id');
    } else if (sessionFocusCache?.alertId) {
      setSelectedAlertId(sessionFocusCache.alertId);
    }

    // Clear the cache synchronously soon after mount has completed
    const timer = setTimeout(() => {
      sessionFocusCache = null;
    }, 1000);

    return () => clearTimeout(timer);
  }, [onUpdateUserCoords]);

  // Get active node details for displaying in sidebar
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div id="network-map-container" className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Interactive Map Visualizer */}
      <div className="lg:col-span-3 bg-slate-900 border border-slate-700/60 rounded-xl overflow-hidden relative shadow-2xl">
        <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <Radio className={`w-5 h-5 ${isDesastreMode ? 'text-amber-500 animate-pulse' : 'text-emerald-500'}`} />
            <h3 className="font-display font-semibold text-slate-100">
              {isDesastreMode ? 'Mapa de Red SOS - MODO DESASTRE ACTIVO' : 'Mapa Táctico del Estado de Red Mesh'}
            </h3>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500"></span> Mi Nodo (Tú)
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500"></span> SOS Activo
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Nodos Mesh
            <span className="text-slate-500">| Haz click en el mapa para simular tu posición GPS</span>
          </div>
        </div>

        {/* SVG Interactive Canvas */}
        <div className="relative overflow-auto" style={{ height: '420px' }}>
          <svg
            id="mesh-svg-map"
            width="100%"
            height="100%"
            viewBox={`0 0 ${mapWidth} ${mapHeight}`}
            className="bg-slate-950 cursor-crosshair select-none"
            onClick={handleMapClick}
          >
            {/* Grid Lines for tech aesthetic */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Coverage safety circles of emergency nodes */}
            {nodes.map(node => (
              <circle
                key={`coverage-${node.id}`}
                cx={scaleX(node.lng)}
                cy={scaleY(node.lat)}
                r={node.role === 'operator' ? 110 : 75}
                fill={node.isOnline ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.02)'}
                stroke={node.isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.05)'}
                strokeDasharray="4,4"
              />
            ))}

            {/* Mesh Network Connections / Links Overlay */}
            {nodes.filter(n => n.isOnline).map((node, idx) => {
              // Connect every online node to the closest nodes representing mesh hops
              const neighbors = nodes
                .filter(other => other.id !== node.id && other.isOnline)
                .map(other => {
                  const dist = Math.sqrt(Math.pow(other.lat - node.lat, 2) + Math.pow(other.lng - node.lng, 2));
                  return { node: other, dist };
                })
                .sort((a, b) => a.dist - b.dist)
                .slice(0, 2); // Connect to closest 2 neighbors

              return neighbors.map(neighbor => (
                <line
                  key={`link-${node.id}-${neighbor.node.id}`}
                  x1={scaleX(node.lng)}
                  y1={scaleY(node.lat)}
                  x2={scaleX(neighbor.node.lng)}
                  y2={scaleY(neighbor.node.lat)}
                  stroke={isDesastreMode ? '#f59e0b' : '#10b981'}
                  strokeWidth="1.5"
                  strokeOpacity="0.3"
                  strokeDasharray={node.signal < -80 ? "3,3" : undefined}
                />
              ));
            })}

            {/* Pathway from current user to the closest server operator gateway via neighbors */}
            {(() => {
              const closestNeighbor = nodes
                .filter(n => n.isOnline)
                .map(n => ({
                  node: n,
                  dist: Math.sqrt(Math.pow(n.lat - userLat, 2) + Math.pow(n.lng - userLng, 2))
                }))
                .sort((a, b) => a.dist - b.dist)[0];

              if (closestNeighbor) {
                return (
                  <g>
                    {/* Glowing direct hop lines */}
                    <line
                      x1={scaleX(userLng)}
                      y1={scaleY(userLat)}
                      x2={scaleX(closestNeighbor.node.lng)}
                      y2={scaleY(closestNeighbor.node.lat)}
                      stroke="#3b82f6"
                      strokeWidth="2.5"
                      strokeDasharray="6,4"
                      className="animate-pulse"
                    />
                    {/* Hops indicator overlay */}
                    <text
                      x={(scaleX(userLng) + scaleX(closestNeighbor.node.lng)) / 2}
                      y={(scaleY(userLat) + scaleY(closestNeighbor.node.lat)) / 2 - 8}
                      fill="#60a5fa"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      Salto 1 ({Math.round(closestNeighbor.node.signal)} dBm)
                    </text>
                  </g>
                );
              }
              return null;
            })()}

            {/* 1. Optimal Route Path from User to Nearest SOS Alert */}
            {(() => {
              const activeAlerts = alerts.filter(a => a.status !== 'resolved');
              if (activeAlerts.length === 0) return null;
              
              let closestAlert: any = null;
              let minDistance = Infinity;
              
              activeAlerts.forEach(a => {
                const d = haversineDistance(userLat, userLng, parseFloat(String(a.latitude)), parseFloat(String(a.longitude)));
                if (d < minDistance) {
                  minDistance = d;
                  closestAlert = a;
                }
              });
              
              if (closestAlert) {
                const ax = scaleX(parseFloat(String(closestAlert.longitude)));
                const ay = scaleY(parseFloat(String(closestAlert.latitude)));
                const ux = scaleX(userLng);
                const uy = scaleY(userLat);
                
                return (
                  <g>
                    {/* Route line */}
                    <line
                      x1={ux}
                      y1={uy}
                      x2={ax}
                      y2={ay}
                      stroke="#10b981"
                      strokeWidth="3.5"
                      strokeDasharray="5,5"
                      className="animate-pulse"
                      opacity="0.8"
                    />
                    {/* Tooltip along route */}
                    <text
                      x={(ux + ax) / 2}
                      y={(uy + ay) / 2 - 8}
                      fill="#34d399"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      Ruta SOS ({Math.round(minDistance)}m)
                    </text>
                  </g>
                );
              }
              return null;
            })()}

            {/* Render Simulated Rescue Points / Safe spots */}
            <g opacity="0.8">
              {/* Hospital Node Icon */}
              <circle cx={scaleX(-69.3315)} cy={scaleY(10.0715)} r="14" fill="#1e1b4b" stroke="#6366f1" strokeWidth="2" />
              <text x={scaleX(-69.3315)} y={scaleY(10.0715) + 4} fill="#818cf8" fontSize="10" textAnchor="middle" fontWeight="bold">H</text>
              <text x={scaleX(-69.3315)} y={scaleY(10.0715) + 26} fill="#a5b4fc" fontSize="9" textAnchor="middle" fontWeight="medium">Hosp. Central (AMP)</text>

              {/* Safe Shelter Node Icon */}
              <circle cx={scaleX(-69.3175)} cy={scaleY(10.0725)} r="14" fill="#064e3b" stroke="#10b981" strokeWidth="2" />
              <text x={scaleX(-69.3175)} y={scaleY(10.0725) + 4} fill="#34d399" fontSize="10" textAnchor="middle" fontWeight="bold">S</text>
              <text x={scaleX(-69.3175)} y={scaleY(10.0725) + 26} fill="#6ee7b7" fontSize="9" textAnchor="middle" fontWeight="medium">Refugio Catedral</text>
            </g>

            {/* Render Other Nodes */}
            {nodes.map(node => {
              const x = scaleX(node.lng);
              const y = scaleY(node.lat);
              const isSelected = selectedNodeId === node.id;

              return (
                <g
                  key={node.id}
                  className="cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNode(isSelected ? null : node.id);
                  }}
                >
                  {/* Outer selection ring */}
                  {isSelected && (
                    <circle cx={x} cy={y} r="18" fill="none" stroke="#60a5fa" strokeWidth="2" className="animate-spin" strokeDasharray="4,4" />
                  )}

                  {/* Node dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r="9"
                    fill={node.isOnline ? (node.role === 'operator' ? '#ec4899' : '#10b981') : '#ef4444'}
                    stroke="#0f172a"
                    strokeWidth="2"
                    className="group-hover:scale-125 transition-transform"
                  />

                  {/* Dynamic Ring pulse for weak signals */}
                  {node.isOnline && node.signal < -80 && (
                    <circle cx={x} cy={y} r="14" fill="none" stroke="#f59e0b" strokeWidth="1" className="animate-ping" opacity="0.5" />
                  )}

                  {/* Node label */}
                  <text
                    x={x}
                    y={y - 14}
                    fill="#e2e8f0"
                    fontSize="10"
                    fontWeight="600"
                    textAnchor="middle"
                    className="bg-slate-900 px-1 py-0.5 rounded shadow-sm pointer-events-none"
                  >
                    {node.name.split(' ')[0]}
                  </text>

                  {/* Battery display indicator */}
                  <text
                    x={x}
                    y={y + 18}
                    fill="#94a3b8"
                    fontSize="8"
                    fontFamily="var(--font-mono)"
                    textAnchor="middle"
                  >
                    {node.battery}%
                  </text>
                </g>
              );
            })}

            {/* Active/Attending Distress Alerts Pulsing Markers */}
            {alerts.filter(a => a.status !== 'resolved').map(alert => {
              const x = scaleX(parseFloat(alert.longitude as any));
              const y = scaleY(parseFloat(alert.latitude as any));
              const isActive = alert.status === 'active';

              return (
                <g 
                  key={`map-alert-${alert.id}`} 
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAlertId(alert.id);
                  }}
                >
                  {/* Glowing warning halo */}
                  <circle 
                    cx={x} 
                    cy={y} 
                    r={isActive ? 25 : 20} 
                    fill={isActive ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.1)"} 
                    stroke={isActive ? "#ef4444" : "#f59e0b"} 
                    strokeWidth="0.5" 
                    className="sos-ring" 
                  />
                  <circle 
                    cx={x} 
                    cy={y} 
                    r={isActive ? 14 : 10} 
                    fill={isActive ? "rgba(239, 68, 68, 0.25)" : "rgba(245, 158, 11, 0.2)"} 
                    stroke={isActive ? "#ef4444" : "#f59e0b"} 
                    strokeWidth="1" 
                    className="animate-ping" 
                  />

                  {/* Warning pin marker */}
                  <circle 
                    cx={x} 
                    cy={y} 
                    r="8.5" 
                    fill={isActive ? "#ef4444" : "#f59e0b"} 
                    stroke="#ffffff" 
                    strokeWidth="1.5" 
                  />
                  {/* Symbol inside pin */}
                  {isActive ? (
                    <text x={x} y={y + 3} fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">⚠️</text>
                  ) : (
                    <text x={x} y={y + 3} fill="#ffffff" fontSize="8" fontWeight="bold" textAnchor="middle">🚑</text>
                  )}
                  
                  {/* Small tag */}
                  <text 
                    x={x} 
                    y={y - 12} 
                    fill={isActive ? "#fca5a5" : "#fde047"} 
                    fontSize="8" 
                    fontFamily="var(--font-mono)"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {alert.user_name?.split(' ')[0]}
                  </text>
                </g>
              );
            })}

            {/* Current User Node Marker (Tú) */}
            <g
              id="my-node-marker"
              transform={`translate(${scaleX(userLng)}, ${scaleY(userLat)})`}
              className="transition-all duration-300 pointer-events-none"
            >
              {/* Proximity 500m radius circle (63 pixels represent 500m) */}
              <circle cx="0" cy="0" r="63" fill="rgba(59, 130, 246, 0.05)" stroke="rgba(59, 130, 246, 0.3)" strokeWidth="1" strokeDasharray="3,3" />

              {/* Outer ring */}
              <circle cx="0" cy="0" r="16" fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="8" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
              {/* Pulse animation */}
              <circle cx="0" cy="0" r="22" fill="none" stroke="#60a5fa" strokeWidth="1" className="animate-ping" opacity="0.6" />

              <text x="0" y="-20" fill="#60a5fa" fontSize="11" fontWeight="bold" textAnchor="middle">
                MI NODO (TÚ)
              </text>
            </g>

            {/* HUD / Legend Overlay in Bottom Right Corner */}
            <g transform={`translate(${mapWidth - 145}, ${mapHeight - 115})`} className="pointer-events-none select-none">
              <rect width="135" height="100" rx="6" fill="rgba(15, 23, 42, 0.85)" stroke="#334155" strokeWidth="1.5" />
              
              <text x="12" y="18" fill="#94a3b8" fontSize="9" fontWeight="bold" fontFamily="var(--font-mono)">LEYENDA TÁCTICA</text>
              
              <circle cx="18" cy="35" r="5" fill="#ef4444" />
              <text x="32" y="38" fill="#e2e8f0" fontSize="9" fontWeight="medium">🔴 SOS Activo</text>
              
              <circle cx="18" cy="52" r="5" fill="#f59e0b" />
              <text x="32" y="55" fill="#e2e8f0" fontSize="9" fontWeight="medium">🟡 En Atención</text>
              
              <circle cx="18" cy="69" r="5" fill="#10b981" />
              <text x="32" y="72" fill="#e2e8f0" fontSize="9" fontWeight="medium">🟢 Resuelto</text>
              
              <circle cx="18" cy="86" r="5" fill="#3b82f6" />
              <text x="32" y="89" fill="#e2e8f0" fontSize="9" fontWeight="medium">🔵 Tu Posición</text>
            </g>
          </svg>
        </div>

        {/* Interactive Alert Popup Card */}
        {(() => {
          if (!selectedAlertId) return null;
          const selectedAlert = alerts.find(a => a.id === selectedAlertId);
          if (!selectedAlert) return null;
          const isActive = selectedAlert.status === 'active';

          return (
            <div className="absolute top-16 right-4 bg-slate-950/95 border border-slate-800 p-4 rounded-xl shadow-2xl z-20 w-[280px] space-y-3 backdrop-blur text-xs">
              <div className="flex justify-between items-start">
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                  isActive ? 'bg-red-950 text-red-400 border border-red-900/40 animate-pulse' : 'bg-amber-950 text-amber-400 border border-amber-900/40'
                }`}>
                  {isActive ? '⚠️ SOS ACTIVO' : '🚑 EN ATENCIÓN'}
                </span>
                <button 
                  onClick={() => {
                    setSelectedAlertId(null);
                    setSuccessMessage(null);
                    setErrorMessage(null);
                  }} 
                  className="text-slate-400 hover:text-slate-200 p-0.5 rounded-lg hover:bg-slate-900 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <h4 className="font-bold text-slate-100">{selectedAlert.user_name || 'Afectado'}</h4>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  Distancia: <span className="text-sky-400 font-bold">
                    {Math.round(haversineDistance(userLat, userLng, parseFloat(String(selectedAlert.latitude)), parseFloat(String(selectedAlert.longitude))))}m
                  </span>
                </p>
              </div>

              <p className="text-slate-300 leading-relaxed bg-slate-900 p-2 rounded border border-slate-800 italic">
                "{selectedAlert.description || 'Sin descripción disponible.'}"
              </p>

              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span className="flex items-center gap-0.5">
                  <Battery className="w-3.5 h-3.5 text-emerald-400" /> {selectedAlert.battery_level}% Bat
                </span>
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3.5 h-3.5" /> hace {Math.round(Math.max(0, (Date.now() - new Date(selectedAlert.created_at).getTime()) / 60000))} min
                </span>
              </div>

              {/* Mensajes de feedback */}
              {successMessage && (
                <div className="p-2 bg-emerald-950/60 border border-emerald-900 rounded text-emerald-400 text-[10px] text-center font-mono animate-pulse">
                  {successMessage}
                </div>
              )}
              {errorMessage && (
                <div className="p-2 bg-red-950/60 border border-red-900 rounded text-red-400 text-[10px] text-center font-mono">
                  {errorMessage}
                </div>
              )}

              {/* Botones de Acción */}
              {userRole !== 'user' && (
                <div className="pt-2 border-t border-slate-900 flex gap-2">
                  {isActive ? (
                    <button
                      onClick={async () => {
                        setSuccessMessage(null);
                        setErrorMessage(null);
                        try {
                          const opName = userRole === 'operator' ? 'Operador RedSOS' : 'Brigadista RedSOS';
                          if (onAttendAlert) {
                            onAttendAlert(selectedAlert.id);
                          } else {
                            await markAsAttending(selectedAlert.id, opName, adminToken);
                            setSuccessMessage('✓ Registrado en atención.');
                          }
                          setTimeout(() => setSelectedAlertId(null), 2500);
                        } catch (err: any) {
                          setErrorMessage(`Error: ${err.message}`);
                        }
                      }}
                      className="flex-1 bg-amber-600 hover:bg-amber-500 text-[#0f0a00] font-bold py-1.5 rounded transition-colors text-[10px]"
                    >
                      ATENDER
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        setSuccessMessage(null);
                        setErrorMessage(null);
                        try {
                          await markAsResolved(selectedAlert.id, adminToken);
                          setSuccessMessage('✓ Emergencia marcada como resuelta.');
                          setTimeout(() => setSelectedAlertId(null), 2500);
                        } catch (err: any) {
                          setErrorMessage(`Error: ${err.message}`);
                        }
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded transition-colors text-[10px]"
                    >
                      RESOLVER
                    </button>
                  )}
                  <a
                    href={`https://maps.google.com/?q=${selectedAlert.latitude},${selectedAlert.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-1.5 rounded transition-colors text-[10px] text-center"
                  >
                    NAVEGAR
                  </a>
                </div>
              )}
            </div>
          );
        })()}


        {/* Coords footer tracker */}
        <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 backdrop-blur border border-slate-700/60 p-2.5 rounded-lg flex justify-between items-center text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-slate-300">
              <Navigation className="w-3.5 h-3.5 text-blue-400 rotate-45" />
              Coordenadas GPS Actuales:
            </span>
            <span className="font-mono text-blue-300 font-semibold">{userLat.toFixed(5)}° N, {userLng.toFixed(5)}° O</span>
          </div>
          <button
            onClick={() => onUpdateUserCoords(10.0735 + (Math.random() - 0.5) * 0.015, -69.3250 + (Math.random() - 0.5) * 0.015)}
            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600/60 px-2 py-1 rounded transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Reubicar GPS
          </button>
        </div>
      </div>

      {/* Selected Node Telemetry Sidebar */}
      <div id="selected-node-sidebar" className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 shadow-xl flex flex-col justify-between">
        <div>
          <h3 className="font-display font-semibold text-lg text-slate-100 border-b border-slate-800 pb-2 mb-4">
            Información del Nodo
          </h3>

          {selectedNode ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-slate-200 text-sm font-display">{selectedNode.name}</h4>
                  <p className="text-xs text-slate-400 font-mono">ID: {selectedNode.id}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                  selectedNode.role === 'operator' ? 'bg-pink-950 text-pink-400 border border-pink-900' :
                  selectedNode.role === 'brigadist' ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                  selectedNode.role === 'shelter' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {selectedNode.role}
                </span>
              </div>

              {/* Telemetry rows */}
              <div className="space-y-3 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Estado</span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className={`w-2 h-2 rounded-full ${selectedNode.isOnline ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></span>
                    {selectedNode.isOnline ? 'CONECTADO MESH' : 'DESCONECTADO'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Potencia de Señal</span>
                  <span className={`text-xs font-mono font-semibold ${
                    selectedNode.signal > -55 ? 'text-emerald-400' :
                    selectedNode.signal > -75 ? 'text-yellow-400' : 'text-red-400 animate-pulse'
                  }`}>
                    {selectedNode.signal} dBm
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Nivel de Batería</span>
                  <span className="flex items-center gap-1 text-xs font-mono font-semibold text-slate-300">
                    <Battery className={`w-4 h-4 ${selectedNode.battery > 30 ? 'text-slate-300' : 'text-red-500 fill-red-500/20'}`} />
                    {selectedNode.battery}%
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Latitud</span>
                  <span className="text-xs font-mono text-slate-300">{selectedNode.lat.toFixed(5)}°</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Longitud</span>
                  <span className="text-xs font-mono text-slate-300">{selectedNode.lng.toFixed(5)}°</span>
                </div>
              </div>

              {/* Signal Health Status Analysis */}
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-400 block mb-1 font-semibold uppercase tracking-wider text-[9px]">Salud del Enlace</span>
                <p className="text-slate-300">
                  {selectedNode.signal > -50 ? 'Enlace excelente. Ruta de propagación directa de alta capacidad.' :
                   selectedNode.signal > -70 ? 'Enlace estable. Adecuado para transmisión de voz comprimida y texto.' :
                   selectedNode.signal > -85 ? 'Enlace crítico. Conexión inestable por distancia o interferencia. Se sugiere usar múltiples saltos.' :
                   'Pérdida severa de paquetes. Intentando auto-recuperar conexión.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <Radio className="w-10 h-10 text-slate-600 mx-auto mb-3 stroke-1 animate-pulse" />
              <p className="text-xs text-slate-400 px-4">
                Haz click en un nodo de la red mesh en el mapa para ver su telemetría táctica y estado de enlace.
              </p>
            </div>
          )}
        </div>

        {/* SOS Summary indicator */}
        <div className="mt-6 pt-4 border-t border-slate-800">
          <div className="bg-red-950/20 border border-red-900/40 p-3.5 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5 animate-pulse" />
            <div>
              <h5 className="text-xs font-semibold text-red-300 font-display">Alertas Activas en Área</h5>
              <p className="text-[11px] text-red-400 font-mono mt-0.5">
                {alerts.filter(a => a.status === 'active').length} críticas sin atender
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
