import React, { useState } from 'react';
import { Camera, Video, Compass, Plane, RefreshCw, Battery, Radio, AlertCircle, Signal } from 'lucide-react';

export default function CameraPanel() {
  const [activeCam, setActiveCam] = useState<string>('dron-1');

  const cams = [
    {
      id: 'dron-1',
      name: 'Dron Táctico Rescue Recon-1',
      type: 'Drone',
      battery: 84,
      height: '42m',
      velocity: '18 km/h',
      lat: 19.4326,
      lng: -99.1332,
      status: 'Transmitiendo',
      placeholderBg: 'bg-indigo-950/40 text-indigo-400',
      feedMsg: '[RECON-1 SENSOR DIRECTO]: Vigilancia de Zonas de Derrumbe y Búsqueda Térmica Activa'
    },
    {
      id: 'cctv-zocalo',
      name: 'CCTV Plaza Zócalo - Esquina Norte',
      type: 'CCTV IP Camera (RTSP)',
      battery: 100, // AC powered
      height: '12m (Poste de Luz)',
      velocity: '0 km/h',
      lat: 19.4310,
      lng: -99.1312,
      status: 'Conectado (Híbrido)',
      placeholderBg: 'bg-emerald-950/40 text-emerald-400',
      feedMsg: '[CCTV-04-NORTH]: Flujo en vivo de seguridad civil de la plaza central'
    },
    {
      id: 'satellite-uplink',
      name: 'Enlace Satelital Starlink Portátil (Sect. 3)',
      type: 'Satelital / Gateway',
      battery: 92,
      height: 'Elevado (Azotea Base)',
      velocity: 'Estacionario',
      lat: 19.4340,
      lng: -99.1360,
      status: 'Gateway Activo',
      placeholderBg: 'bg-amber-950/40 text-amber-400',
      feedMsg: '[SAT-GATEWAY-02]: Monitoreo de tramas Mesh volcándose al satélite de órbita baja'
    }
  ];

  const selectedCam = cams.find(c => c.id === activeCam) || cams[0];

  return (
    <div id="cctv-drones-telemetry" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Telemetry control side panel */}
      <div className="space-y-4">
        <div className="bg-slate-900 border border-slate-700/60 p-4 rounded-xl flex items-center gap-2">
          <Plane className="w-5 h-5 text-indigo-400" />
          <h3 className="font-display font-semibold text-slate-100 text-sm">
            Dispositivos de Reconocimiento y Enlaces
          </h3>
        </div>

        <div className="space-y-3">
          {cams.map(cam => (
            <div
              key={cam.id}
              onClick={() => setActiveCam(cam.id)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                activeCam === cam.id
                  ? 'bg-slate-850 border-indigo-500/50 shadow-lg'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase">{cam.type}</span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <h4 className="font-display font-bold text-xs text-slate-100">{cam.name}</h4>
              
              <div className="grid grid-cols-3 gap-1.5 mt-3 text-[10px] font-mono text-slate-400 border-t border-slate-800 pt-2">
                <div>🔋 {cam.battery}%</div>
                <div className="truncate">📍 GPS OK</div>
                <div className="text-right text-emerald-400 font-bold">{cam.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Video feeds viewport simulation column */}
      <div className="lg:col-span-2 bg-slate-900 border border-slate-700/60 rounded-xl p-6 shadow-xl flex flex-col justify-between min-h-[460px]">
        <div className="space-y-4 flex-1 flex flex-col justify-between">
          
          {/* Header video info */}
          <div className="border-b border-slate-850 pb-3 flex justify-between items-center">
            <div>
              <h3 className="font-display font-black text-slate-100 text-sm">{selectedCam.name}</h3>
              <span className="text-[10px] text-slate-400 font-mono">Tipo: {selectedCam.type} | Coordenadas: {selectedCam.lat.toFixed(4)}, {selectedCam.lng.toFixed(4)}</span>
            </div>
            <button className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              Reconectar Canal
            </button>
          </div>

          {/* Interactive viewport simulator */}
          <div className={`relative h-[280px] rounded-xl border border-slate-850 flex flex-col items-center justify-center p-6 text-center ${selectedCam.placeholderBg} overflow-hidden`}>
            
            {/* Simulation camera layout grids */}
            <div className="absolute inset-0 border-2 border-slate-800/10 pointer-events-none">
              <div className="absolute left-1/2 top-0 bottom-0 border-r border-dashed border-slate-500/20"></div>
              <div className="absolute top-1/2 left-0 right-0 border-b border-dashed border-slate-500/20"></div>
            </div>

            {/* Corner camera overlay indicators */}
            <div className="absolute top-4 left-4 text-[10px] font-mono tracking-widest text-red-500 font-bold animate-pulse flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              REC IN VIVO
            </div>
            <div className="absolute top-4 right-4 text-[10px] font-mono text-slate-300">
              ISO 400 • F/2.8 • 60 FPS
            </div>
            <div className="absolute bottom-4 left-4 text-[10px] font-mono text-slate-300">
              ALT: {selectedCam.height} | VEL: {selectedCam.velocity}
            </div>
            <div className="absolute bottom-4 right-4 text-[10px] font-mono text-emerald-400 font-bold">
              BATERÍA COLD-CAP: {selectedCam.battery}%
            </div>

            {/* Center camera visual symbol */}
            <Video className="w-16 h-16 stroke-1 mb-3 animate-pulse text-indigo-400" />
            <p className="text-xs font-mono font-bold max-w-md uppercase tracking-wider">{selectedCam.feedMsg}</p>
            <p className="text-[10px] text-slate-400 mt-2">Simulador táctico integrado - Enlace seguro TLS 1.3</p>
          </div>

          {/* Sensor information block details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-850">
            <div className="flex items-center gap-2 text-xs">
              <Compass className="w-4 h-4 text-indigo-400" />
              <div>
                <span className="text-[10px] text-slate-500 block font-bold">RUMBO RECON</span>
                <span className="font-mono text-slate-300 font-bold">NNE 24°</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Battery className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-[10px] text-slate-500 block font-bold">CARGA DISPOSITIVO</span>
                <span className="font-mono text-slate-300 font-bold">Autonomía: 3.5 hrs</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Signal className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-[10px] text-slate-500 block font-bold">TASA DE TRANSFERENCIA</span>
                <span className="font-mono text-slate-300 font-bold">4.2 Mbps (Mesh)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
