import React, { useState } from 'react';
import { ShieldAlert, Zap, Truck, CheckCircle2, Clock, MapPin, User, FileText, AlertTriangle } from 'lucide-react';

interface Incident {
  id: string;
  number: string;
  priority: 1 | 2 | 3 | 4 | 5;
  status: 'open' | 'dispatched' | 'attending' | 'closed';
  title: string;
  locationName: string;
  lat: number;
  lng: number;
  description: string;
  assignedResources: string[];
  responseTimeSec?: number;
  createdAt: string;
  logs: string[];
}

export default function IncidentPanel() {
  const [incidents, setIncidents] = useState<Incident[]>([
    {
      id: "inc-101",
      number: "INC-2026-0043",
      priority: 1,
      status: 'attending',
      title: "Colapso Estructural - Edificio C",
      locationName: "Calle Isabel la Católica, Centro",
      lat: 19.4265,
      lng: -99.1350,
      description: "Posibles personas atrapadas en sótano tras colapso parcial de mampostería. Reportado por nodo Mesh de Gael T.",
      assignedResources: ["Unidad Ambulancia Alfa-3", "Brigada Halcón Centro", "Dron Explorador Recon-1"],
      responseTimeSec: 240,
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      logs: [
        "08:12 - Alerta SOS recibida vía multi-hop Bluetooth",
        "08:14 - Incidente clasificado como Prioridad 1 (Vida Humana)",
        "08:16 - Despacho de Brigada Halcón y Unidad Médica",
        "08:19 - Arribo de rescatistas al punto de control local"
      ]
    },
    {
      id: "inc-102",
      number: "INC-2026-0044",
      priority: 2,
      status: 'dispatched',
      title: "Fuga de Gas & Fuego Secundario",
      locationName: "Av. Cinco de Mayo, Local comercial",
      lat: 19.4305,
      lng: -99.1275,
      description: "Olor intenso a gas GLP con flama abierta visible en planta alta. Sin reporte de lesionados graves.",
      assignedResources: ["Unidad Bomberos Tanque-12"],
      createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      logs: [
        "08:42 - Reporte ingresado por el Gateway 'Estación Base 4'",
        "08:44 - Bomberos despachados desde base norte"
      ]
    }
  ]);

  const [activeIncidentId, setActiveIncidentId] = useState<string | null>("inc-101");
  const [newLogText, setNewLogText] = useState('');

  const selectedIncident = incidents.find(i => i.id === activeIncidentId);

  const handleAddLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogText.trim() || !activeIncidentId) return;

    setIncidents(prev => prev.map(inc => {
      if (inc.id === activeIncidentId) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return {
          ...inc,
          logs: [...inc.logs, `${timeStr} - ${newLogText}`]
        };
      }
      return inc;
    }));
    setNewLogText('');
  };

  const handleUpdateStatus = (incidentId: string, status: 'open' | 'dispatched' | 'attending' | 'closed') => {
    setIncidents(prev => prev.map(inc => {
      if (inc.id === incidentId) {
        return {
          ...inc,
          status,
          responseTimeSec: status === 'closed' ? Math.floor(Math.random() * 600) + 300 : inc.responseTimeSec
        };
      }
      return inc;
    }));
  };

  const getPriorityBadge = (prio: number) => {
    switch (prio) {
      case 1:
        return <span className="bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">P1 - Vida Humana</span>;
      case 2:
        return <span className="bg-amber-950 text-amber-400 border border-amber-900 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">P2 - Incendio</span>;
      case 3:
        return <span className="bg-yellow-950 text-yellow-400 border border-yellow-900 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">P3 - Accidentes</span>;
      case 4:
        return <span className="bg-blue-950 text-blue-400 border border-blue-900 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">P4 - Desastre</span>;
      default:
        return <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">P5 - Informativo</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <span className="text-red-500 font-bold uppercase animate-pulse">Abierto</span>;
      case 'dispatched':
        return <span className="text-blue-400 font-semibold uppercase">Despachado</span>;
      case 'attending':
        return <span className="text-amber-400 font-semibold uppercase">Atendiendo</span>;
      case 'closed':
        return <span className="text-emerald-400 font-semibold uppercase">Cerrado</span>;
      default:
        return <span className="text-slate-400">Desconocido</span>;
    }
  };

  return (
    <div id="incident-c4i-manager" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Incidents List Pane */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-slate-900 border border-slate-700/60 p-4 rounded-xl flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          <h3 className="font-display font-semibold text-slate-100 text-sm">
            Cola de Incidentes Activos ({incidents.filter(i => i.status !== 'closed').length})
          </h3>
        </div>

        <div className="space-y-3">
          {incidents.map(inc => (
            <div
              key={inc.id}
              onClick={() => setActiveIncidentId(inc.id)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                activeIncidentId === inc.id
                  ? 'bg-slate-850 border-emerald-500/50 shadow-lg shadow-emerald-950/10'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
              }`}
            >
              <div className="flex justify-between items-start gap-2 mb-2">
                <span className="font-mono text-[10px] text-slate-400 font-semibold">{inc.number}</span>
                {getPriorityBadge(inc.priority)}
              </div>

              <h4 className="font-display font-bold text-xs text-slate-100 line-clamp-1 mb-1">{inc.title}</h4>
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-3">{inc.description}</p>

              <div className="flex justify-between items-center border-t border-slate-800 pt-2 text-[10px]">
                <span className="text-slate-500">{new Date(inc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="font-semibold">{getStatusBadge(inc.status)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Incident details / dispatcher workspace */}
      <div className="lg:col-span-2 bg-slate-900 border border-slate-700/60 rounded-xl p-6 shadow-xl flex flex-col justify-between min-h-[460px]">
        {selectedIncident ? (
          <div className="space-y-6 flex-1">
            
            {/* Header info */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-850 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-slate-400 font-bold">{selectedIncident.number}</span>
                  <span>•</span>
                  <span className="text-slate-500">{new Date(selectedIncident.createdAt).toLocaleString()}</span>
                </div>
                <h3 className="font-display font-black text-slate-100 text-lg mt-1">{selectedIncident.title}</h3>
                <span className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  {selectedIncident.locationName} ({selectedIncident.lat.toFixed(4)}, {selectedIncident.lng.toFixed(4)})
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleUpdateStatus(selectedIncident.id, 'dispatched')}
                  className={`px-2.5 py-1.5 rounded text-[10px] font-semibold border ${
                    selectedIncident.status === 'dispatched'
                      ? 'bg-blue-950 text-blue-400 border-blue-800'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-850'
                  }`}
                >
                  Despachar
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedIncident.id, 'attending')}
                  className={`px-2.5 py-1.5 rounded text-[10px] font-semibold border ${
                    selectedIncident.status === 'attending'
                      ? 'bg-amber-950 text-amber-400 border-amber-800'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-850'
                  }`}
                >
                  Atendiendo
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedIncident.id, 'closed')}
                  className={`px-2.5 py-1.5 rounded text-[10px] font-semibold border ${
                    selectedIncident.status === 'closed'
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-850'
                  }`}
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* General Description */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Bitácora General y Descripción</span>
              <p className="text-xs text-slate-200 leading-relaxed">{selectedIncident.description}</p>
            </div>

            {/* Resources assigned dispatch details */}
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Recursos Asignados en Zona</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {selectedIncident.assignedResources.map(res => (
                  <div key={res} className="bg-slate-950 p-3 rounded-lg border border-slate-850 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-emerald-400" />
                    <span className="text-[11px] font-medium text-slate-300">{res}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Respond tracking info / timeline */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              
              {/* Timeline list */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Línea de Tiempo Operativa</span>
                <div className="space-y-1.5 h-[150px] overflow-y-auto bg-slate-950 p-3 rounded-lg border border-slate-850 text-[10px] font-mono text-slate-300">
                  {selectedIncident.logs.map((log, idx) => (
                    <div key={idx} className="border-b border-slate-900 pb-1.5 last:border-0 text-slate-400">
                      {log}
                    </div>
                  ))}
                </div>

                {/* Log creation form */}
                <form onSubmit={handleAddLog} className="flex gap-2">
                  <input
                    type="text"
                    value={newLogText}
                    onChange={(e) => setNewLogText(e.target.value)}
                    placeholder="Agregar nota a la bitácora..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded p-2 text-xs outline-none focus:border-slate-600"
                  />
                  <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 rounded text-xs">
                    Agregar
                  </button>
                </form>
              </div>

              {/* Metrics audit */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-3">Estadísticas de Despacho</span>
                  <div className="space-y-3 font-mono text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span>Tiempo Respuesta:</span>
                      <span className="text-emerald-400 font-semibold">
                        {selectedIncident.responseTimeSec ? `${Math.floor(selectedIncident.responseTimeSec / 60)} min` : "En tránsito"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Nivel Seguridad:</span>
                      <span className="text-slate-400">Alto (Cifrado Extremo)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Puntaje Cadena:</span>
                      <span className="text-slate-400">5 saltos ruteados</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 p-2.5 rounded border border-slate-800 text-[10px] text-slate-400">
                  ⚠️ Toda acción en este panel queda registrada con firma digital de operador civil y marca de tiempo UTC.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <AlertTriangle className="w-12 h-12 text-slate-700 stroke-1 mb-2" />
            <p className="text-xs text-slate-400">Seleccione un incidente de la lista lateral para desplegar recursos tácticos de emergencia.</p>
          </div>
        )}
      </div>
    </div>
  );
}
