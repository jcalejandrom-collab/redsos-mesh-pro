import React, { useState } from 'react';
import { BrigadeTeam, BrigadeMember } from '../types';
import { Shield, Plus, Users, Heart, Clipboard, Battery, CheckCircle, Zap } from 'lucide-react';

export default function BrigadePanel() {
  // Mock brigades data representing military or civil defense units
  const [brigades, setBrigades] = useState<BrigadeTeam[]>([
    {
      id: "b-team-1",
      name: "Brigada Halcón (Centro)",
      leader: "Sofía Martínez",
      assignedArea: "Sector 1 - Centro Histórico",
      activeMission: "Evaluación estructural de edificios agrietados",
      members: [
        { id: "bm-1", name: "Sofía Martínez", role: "Leader", battery: 84, status: "active", task: "Coordinación con Base" },
        { id: "bm-2", name: "Eduardo López", role: "S&R", battery: 90, status: "active", task: "Búsqueda en Edificio C" },
        { id: "bm-3", name: "Dr. Daniel Cruz", role: "Medical", battery: 72, status: "active", task: "Primeros Auxilios" },
        { id: "bm-4", name: "Diana Solís", role: "Logistics", battery: 65, status: "standby", task: "Inventario de suministros" }
      ]
    },
    {
      id: "b-team-2",
      name: "Brigada Jaguares",
      leader: "Mariano Vega",
      assignedArea: "Sector 3 - Zona Norte / Tlatelolco",
      activeMission: "Apertura de vías y remoción de escombros ligeros",
      members: [
        { id: "bm-5", name: "Mariano Vega", role: "Leader", battery: 95, status: "active", task: "Planeación de Rutas" },
        { id: "bm-6", name: "Gabriel Soto", role: "S&R", battery: 42, status: "active", task: "Remoción con herramienta hidráulica" },
        { id: "bm-7", name: "Laura Ramos", role: "Medical", battery: 88, status: "resting", task: "En guardia" }
      ]
    }
  ]);

  const [newTeamName, setNewTeamName] = useState('');
  const [newLeader, setNewLeader] = useState('');
  const [assignedArea, setAssignedArea] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddBrigade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newLeader.trim()) return;

    const newTeam: BrigadeTeam = {
      id: `b-team-${Date.now()}`,
      name: newTeamName,
      leader: newLeader,
      assignedArea: assignedArea || "Por asignar",
      activeMission: "Pendiente de despacho",
      members: [
        { id: `bm-${Date.now()}-1`, name: newLeader, role: "Leader", battery: 100, status: "standby", task: "Coordinación Inicial" }
      ]
    };

    setBrigades([...brigades, newTeam]);
    setNewTeamName('');
    setNewLeader('');
    setAssignedArea('');
    setIsAdding(false);
  };

  return (
    <div className="space-y-4">
      {/* Banner de Datos de Demostración */}
      <div className="bg-amber-950/40 border border-amber-800/60 p-3 rounded-xl flex items-center gap-2 text-amber-400 text-xs font-mono">
        <Zap className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
        <span>⚠️ <strong>DATOS DE DEMOSTRACIÓN</strong> — Todos los grupos, líderes y misiones listados a continuación representan datos simulados locales, pendiente de integración con backend real.</span>
      </div>

      <div id="brigade-manager-panel" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Brigade squads list column */}
      <div className="lg:col-span-2 space-y-6">
        <div className="flex justify-between items-center bg-slate-900 border border-slate-700/60 p-4 rounded-xl">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <h3 className="font-display font-semibold text-slate-100">Grupos de Respuesta / Brigadas</h3>
          </div>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg transition-colors font-medium shadow-md shadow-emerald-950/20"
          >
            <Plus className="w-4 h-4" /> Crear Brigada
          </button>
        </div>

        {/* Add Brigade Form Overlay */}
        {isAdding && (
          <form onSubmit={handleAddBrigade} className="bg-slate-900 border border-slate-700/60 p-5 rounded-xl space-y-4 shadow-xl">
            <h4 className="font-display font-semibold text-sm text-slate-200">Registrar Nueva Brigada</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] text-slate-400 font-semibold block mb-1">Nombre de Brigada</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Ej. Brigada Cóndor"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:border-emerald-700 outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold block mb-1">Líder del Grupo</label>
                <input
                  type="text"
                  value={newLeader}
                  onChange={(e) => setNewLeader(e.target.value)}
                  placeholder="Nombre de Líder"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:border-emerald-700 outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold block mb-1">Sector Asignado</label>
                <input
                  type="text"
                  value={assignedArea}
                  onChange={(e) => setAssignedArea(e.target.value)}
                  placeholder="Ej. Sector 2 - Roma"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:border-emerald-700 outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-1.5 rounded"
              >
                Guardar Brigada
              </button>
            </div>
          </form>
        )}

        {/* Brigades cards layout */}
        <div className="grid grid-cols-1 gap-6">
          {brigades.map(team => (
            <div key={team.id} className="bg-slate-900 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
              
              {/* Card top banner */}
              <div className="p-4 bg-slate-800/60 border-b border-slate-700/60 flex justify-between items-center">
                <div>
                  <h4 className="font-display font-semibold text-sm text-slate-100">{team.name}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Área: {team.assignedArea}</p>
                </div>
                <div className="bg-emerald-950 text-emerald-400 px-3 py-1 rounded text-xs font-semibold border border-emerald-900">
                  Operativo
                </div>
              </div>

              {/* Mission details */}
              <div className="p-4 bg-slate-950/40 border-b border-slate-800/60">
                <span className="text-[10px] text-slate-500 font-bold uppercase block tracking-wider">Misión Activa</span>
                <p className="text-xs text-slate-300 font-medium mt-1 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
                  {team.activeMission}
                </p>
              </div>

              {/* Members table */}
              <div className="p-4">
                <span className="text-[10px] text-slate-500 font-bold uppercase block tracking-wider mb-2">Miembros y Roles</span>
                <div className="space-y-2">
                  {team.members.map(member => (
                    <div key={member.id} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          member.status === 'active' ? 'bg-emerald-500 animate-pulse' :
                          member.status === 'standby' ? 'bg-yellow-500' : 'bg-slate-600'
                        }`}></span>
                        <div>
                          <span className="text-xs font-semibold text-slate-200 block">{member.name}</span>
                          <span className="text-[10px] text-slate-400 block font-mono">Tarea: {member.task}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
                          member.role === 'Leader' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900' :
                          member.role === 'Medical' ? 'bg-red-950 text-red-400 border border-red-900' :
                          member.role === 'S&R' ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {member.role === 'Leader' ? 'Líder' : member.role === 'Medical' ? 'Médico' : member.role === 'S&R' ? 'Búsqueda' : 'Logística'}
                        </span>

                        <span className="flex items-center gap-1 text-[10px] font-mono text-slate-300">
                          <Battery className="w-3.5 h-3.5 text-slate-400" />
                          {member.battery}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar tips & emergency roles overview */}
      <div className="space-y-6">
        <div className="bg-slate-900 border border-slate-700/60 p-5 rounded-xl shadow-xl">
          <h3 className="font-display font-semibold text-slate-100 text-base mb-4 border-b border-slate-800 pb-2">
            Organización de Brigadas
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Las brigadas civiles y de protección civil se registran con firma criptográfica local para autorizar la retransmisión prioritaria de sus mensajes de voz y telemetría crítica de GPS.
          </p>

          <div className="space-y-4 mt-4">
            <div className="flex items-start gap-3 p-3 bg-slate-950 rounded-lg border border-slate-850">
              <Shield className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-semibold text-slate-200">Líder de Brigada</h5>
                <p className="text-[11px] text-slate-400 mt-0.5">Autoriza el despacho de incidentes y coordina con el centro de mando vía Mesh Multi-salto.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-950 rounded-lg border border-slate-850">
              <Heart className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-semibold text-slate-200">Médicos de Campaña</h5>
                <p className="text-[11px] text-slate-400 mt-0.5">Tienen prioridad de transmisión de datos biométricos y reportes clínicos locales.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-950 rounded-lg border border-slate-850">
              <Clipboard className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-semibold text-slate-200">Búsqueda y Rescate (S&R)</h5>
                <p className="text-[11px] text-slate-400 mt-0.5">Equipados con localizadores Bluetooth Direct para rastrear teléfonos atrapados en estructuras.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Emergency instructions reminder */}
        <div className="bg-emerald-950/20 border border-emerald-900/40 p-4 rounded-xl text-xs text-emerald-400">
          <h4 className="font-display font-bold text-emerald-300">💡 Tip de Supervivencia:</h4>
          <p className="mt-1 leading-relaxed text-[11px]">
            En escenarios sin internet, configura tu teléfono en **Modo Desastre** para deshabilitar las tramas gráficas innecesarias y maximizar la batería del emisor BLE.
          </p>
        </div>
      </div>
    </div>
    </div>
  );
}
