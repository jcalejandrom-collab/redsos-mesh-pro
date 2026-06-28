import React, { useState } from 'react';
import { MeshNode, EmergencyAlert } from '../types';
import { Radio, MapPin, Battery, AlertTriangle, Shield, CheckCircle2, Navigation, RefreshCw } from 'lucide-react';

interface NetworkMapProps {
  nodes: MeshNode[];
  alerts: EmergencyAlert[];
  userLat: number;
  userLng: number;
  onUpdateUserCoords: (lat: number, lng: number) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  isDesastreMode: boolean;
}

export default function NetworkMap({
  nodes,
  alerts,
  userLat,
  userLng,
  onUpdateUserCoords,
  selectedNodeId,
  onSelectNode,
  isDesastreMode
}: NetworkMapProps) {
  // Map dimensions reference
  const mapWidth = 800;
  const mapHeight = 500;

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

            {/* Active Distress Alerts Pulsing Markers */}
            {alerts.filter(a => a.status !== 'resolved').map(alert => {
              const x = scaleX(alert.longitude);
              const y = scaleY(alert.latitude);

              return (
                <g key={`map-alert-${alert.id}`} className="pointer-events-none">
                  {/* Glowing warning halo */}
                  <circle cx={x} cy={y} r="25" fill="rgba(239, 68, 68, 0.12)" stroke="#ef4444" strokeWidth="0.5" className="sos-ring" />
                  <circle cx={x} cy={y} r="14" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" strokeWidth="1" className="animate-ping" />

                  {/* Warning pin */}
                  <circle cx={x} cy={y} r="7" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                  <path d="M-3,-3 L3,3 M3,-3 L-3,3" stroke="#ffffff" strokeWidth="1.2" transform={`translate(${x}, ${y})`} />
                </g>
              );
            })}

            {/* Current User Node Marker (Tú) */}
            <g
              id="my-node-marker"
              transform={`translate(${scaleX(userLng)}, ${scaleY(userLat)})`}
              className="transition-all duration-300 pointer-events-none"
            >
              {/* Outer ring */}
              <circle cx="0" cy="0" r="16" fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="8" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
              {/* Pulse animation */}
              <circle cx="0" cy="0" r="22" fill="none" stroke="#60a5fa" strokeWidth="1" className="animate-ping" opacity="0.6" />

              <text x="0" y="-20" fill="#60a5fa" fontSize="11" fontWeight="bold" textAnchor="middle">
                MI NODO (TÚ)
              </text>
            </g>
          </svg>
        </div>

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
