import React, { useState, useEffect } from 'react';
import { MeshNode, PacketLog } from '../types';
import { Radio, Battery, Activity, HardDrive, Cpu, AlertTriangle, Play, RefreshCw, Trash2, Edit2, CheckCircle } from 'lucide-react';

interface SimulationPanelProps {
  nodes: MeshNode[];
  onAddOrUpdateNode: (payload: any) => void;
  onRemoveNode: (id: string) => void;
  onTriggerFall: () => void;
  onTriggerBatteryCritica: () => void;
  onTriggerSignalJammer: () => void;
  isJammed: boolean;
  isFallDetected: boolean;
}

export default function SimulationPanel({
  nodes,
  onAddOrUpdateNode,
  onRemoveNode,
  onTriggerFall,
  onTriggerBatteryCritica,
  onTriggerSignalJammer,
  isJammed,
  isFallDetected
}: SimulationPanelProps) {
  // Simulated packet logs state
  const [packetLogs, setPacketLogs] = useState<PacketLog[]>([]);
  const [activeSchemaTab, setActiveSchemaTab] = useState<'users' | 'alerts' | 'messages' | 'locations' | 'mesh_neighbors'>('alerts');

  // Manual Node Add/Edit Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<'operator' | 'brigadist' | 'user' | 'shelter' | 'repeater'>('user');
  const [formBattery, setFormBattery] = useState(100);
  const [formSignal, setFormSignal] = useState(-60);
  const [formLat, setFormLat] = useState(19.4326);
  const [formLng, setFormLng] = useState(-99.1332);
  const [formOnline, setFormOnline] = useState(true);

  // SQL schema definition reference for visual inspector
  const sqlSchemas = {
    users: `CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  role VARCHAR(30) DEFAULT 'user', -- 'user', 'brigadist', 'operator', 'admin'
  battery_level INT DEFAULT 100,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
    alerts: `CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION,
  accuracy REAL,
  speed REAL,
  battery_level INT,
  connection_type VARCHAR(30), -- 'internet', 'mesh_bluetooth', 'mesh_wifi'
  status VARCHAR(30) DEFAULT 'active', -- 'active', 'attending', 'resolved'
  audio_url TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
    messages: `CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES chats(id),
  sender_id UUID REFERENCES users(id),
  sender_name VARCHAR(100),
  content TEXT NOT NULL,
  type VARCHAR(30) DEFAULT 'text', -- 'text', 'location', 'audio', 'image'
  uuid VARCHAR(100) UNIQUE NOT NULL, -- Mesh UUID
  ttl INT DEFAULT 5,
  hops INT DEFAULT 0,
  signature TEXT,
  hash_sha256 VARCHAR(64),
  is_synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
    locations: `CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION,
  speed REAL,
  bearing REAL,
  accuracy REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
    mesh_neighbors: `CREATE TABLE mesh_neighbors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_name VARCHAR(100) NOT NULL,
  signal_dbm INT,
  battery_level INT,
  role VARCHAR(30),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`
  };

  // Generate packet log simulation traffic
  useEffect(() => {
    const interval = setInterval(() => {
      if (isJammed) return; // No traffic during jam

      const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
      if (!randomNode || !randomNode.isOnline) return;

      const directions: ('TX' | 'RX' | 'HOP')[] = ['TX', 'RX', 'HOP'];
      const dir = directions[Math.floor(Math.random() * directions.length)];
      
      const newLog: PacketLog = {
        id: `pkt-${Math.random().toString(36).substring(7)}`,
        timestamp: new Date().toLocaleTimeString(),
        type: dir,
        sender: dir === 'TX' ? "Mi Nodo" : randomNode.name,
        receiver: dir === 'RX' ? "Mi Nodo" : "Estación Central Base",
        messageId: `msg-${Math.floor(Math.random() * 900) + 100}`,
        ttl: Math.floor(Math.random() * 3) + 2,
        hops: Math.floor(Math.random() * 2) + 1,
        sizeBytes: Math.floor(Math.random() * 120) + 24,
        protocol: Math.random() > 0.5 ? 'BLE' : 'WiFi_Direct',
        details: dir === 'TX' ? "Transmitiendo paquete de telemetría de ubicación" :
                 dir === 'RX' ? "Recibiendo confirmación de entrega (ACK)" : "Retransmitiendo paquete SOS vecino"
      };

      setPacketLogs(prev => [newLog, ...prev.slice(0, 14)]);
    }, 3000);

    return () => clearInterval(interval);
  }, [nodes, isJammed]);

  // Open form for adding a node
  const handleOpenCreateForm = () => {
    setEditingNodeId(null);
    setFormName('');
    setFormRole('user');
    setFormBattery(100);
    setFormSignal(-60);
    setFormLat(19.4326 + (Math.random() - 0.5) * 0.01);
    setFormLng(-99.1332 + (Math.random() - 0.5) * 0.01);
    setFormOnline(true);
    setIsFormOpen(true);
  };

  // Open form for editing an existing node
  const handleOpenEditForm = (node: MeshNode) => {
    setEditingNodeId(node.id);
    setFormName(node.name);
    setFormRole(node.role);
    setFormBattery(node.battery);
    setFormSignal(node.signal);
    setFormLat(node.lat);
    setFormLng(node.lng);
    setFormOnline(node.isOnline);
    setIsFormOpen(true);
  };

  // Submit manual nodes form
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      id: editingNodeId,
      name: formName,
      role: formRole,
      battery: formBattery,
      signal: formSignal,
      lat: formLat,
      lng: formLng,
      isOnline: formOnline
    };
    onAddOrUpdateNode(payload);
    setIsFormOpen(false);
  };

  return (
    <div id="simulation-panel-container" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Node Simulators & Emergency Triggers Column */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Scenario and Trigger Controllers */}
        <div className="bg-slate-900 border border-slate-700/60 p-5 rounded-xl shadow-xl">
          <h3 className="font-display font-semibold text-slate-100 text-sm mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Inyección de Eventos Críticos (Simulación de Sensores)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Fall detection */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Detector de Caídas</h4>
                <p className="text-[10px] text-slate-400 mt-1">
                  Simula una desaceleración brusca y ausencia de movimiento prolongado del acelerómetro.
                </p>
              </div>
              <button
                onClick={onTriggerFall}
                className={`w-full mt-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  isFallDetected
                    ? 'bg-red-950 text-red-300 border border-red-700/60 animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                {isFallDetected ? 'Caída Detectada (SOS)' : 'Simular Caída'}
              </button>
            </div>

            {/* Critical Battery */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Modo Batería Crítica</h4>
                <p className="text-[10px] text-slate-400 mt-1">
                  Reduce el nivel al 5% para optimizar tramas y apagar opcionales como WiFi Direct.
                </p>
              </div>
              <button
                onClick={onTriggerBatteryCritica}
                className="w-full mt-4 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Battery className="w-3.5 h-3.5" />
                Batería Crítica 5%
              </button>
            </div>

            {/* Signal Jammer */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Inhibidor de Frecuencia</h4>
                <p className="text-[10px] text-slate-400 mt-1">
                  Bloquea las señales de radio e impide la retransmisión de paquetes por congestión de espectro.
                </p>
              </div>
              <button
                onClick={onTriggerSignalJammer}
                className={`w-full mt-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  isJammed
                    ? 'bg-amber-950 text-amber-300 border border-amber-700/60 animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {isJammed ? 'Señal Inhibida' : 'Inhibir Canales'}
              </button>
            </div>
          </div>
        </div>

        {/* Node Telemetry Editors List */}
        <div className="bg-slate-900 border border-slate-700/60 p-5 rounded-xl shadow-xl">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-4">
            <h3 className="font-display font-semibold text-slate-100 text-sm flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-400" />
              Gestión y Configuración de Nodos Vecinos
            </h3>
            <button
              onClick={handleOpenCreateForm}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs px-2.5 py-1.5 rounded transition-colors"
            >
              + Agregar Nodo
            </button>
          </div>

          {/* Node Add/Edit Form */}
          {isFormOpen && (
            <form onSubmit={handleFormSubmit} className="bg-slate-950 p-4 rounded-lg border border-slate-800 mb-4 space-y-4">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                {editingNodeId ? 'Editar Parámetros de Nodo' : 'Agregar Nuevo Nodo Mesh'}
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Nombre</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Rol</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-slate-200"
                  >
                    <option value="user">Usuario Común</option>
                    <option value="operator">Estación Base Central</option>
                    <option value="brigadist">Brigadista Rescate</option>
                    <option value="shelter">Refugio Seguro</option>
                    <option value="repeater">Repetidor Mesh</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Nivel Batería (%)</label>
                  <input
                    type="number"
                    value={formBattery}
                    onChange={(e) => setFormBattery(Number(e.target.value))}
                    min="0"
                    max="100"
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Señal dBm (Ej. -60)</label>
                  <input
                    type="number"
                    value={formSignal}
                    onChange={(e) => setFormSignal(Number(e.target.value))}
                    min="-100"
                    max="-30"
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Latitud</label>
                  <input
                    type="number"
                    value={formLat}
                    onChange={(e) => setFormLat(Number(e.target.value))}
                    step="0.0001"
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Longitud</label>
                  <input
                    type="number"
                    value={formLng}
                    onChange={(e) => setFormLng(Number(e.target.value))}
                    step="0.0001"
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={formOnline}
                    onChange={(e) => setFormOnline(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-800 text-emerald-600 focus:ring-0"
                  />
                  Nodo Activo y En Línea
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="bg-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-emerald-600 text-white text-xs px-4 py-1.5 rounded"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Nodes list table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase font-mono">
                  <th className="py-2">Nombre</th>
                  <th className="py-2">Rol</th>
                  <th className="py-2">Batería</th>
                  <th className="py-2">Señal</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-xs text-slate-200 divide-y divide-slate-850">
                {nodes.map(node => (
                  <tr key={node.id} className="hover:bg-slate-950/20">
                    <td className="py-2.5 font-semibold flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${node.isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                      {node.name}
                    </td>
                    <td className="py-2.5 font-mono text-[10px] text-slate-400 uppercase">{node.role}</td>
                    <td className="py-2.5 font-mono">{node.battery}%</td>
                    <td className={`py-2.5 font-mono ${node.signal > -65 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {node.signal} dBm
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => handleOpenEditForm(node)}
                          className="text-slate-400 hover:text-slate-100"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onRemoveNode(node.id)}
                          className="text-red-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Real-time packet logs & database schema visualizer column */}
      <div className="space-y-6">
        
        {/* Real-time packet logs tracker */}
        <div className="bg-slate-900 border border-slate-700/60 p-5 rounded-xl shadow-xl">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
            <h3 className="font-display font-semibold text-slate-100 text-xs uppercase tracking-wider">
              Monitor de Tramas Mesh en Vivo
            </h3>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>

          <div className="h-[210px] overflow-y-auto space-y-2 font-mono text-[9px] bg-slate-950 p-3 rounded-lg border border-slate-850">
            {isJammed ? (
              <div className="text-amber-500 text-center py-16 font-semibold animate-pulse">
                [ALERTA] CANALES DE RADIO BLOQUEADOS POR INHIBIDOR DE SEÑAL
              </div>
            ) : packetLogs.length === 0 ? (
              <div className="text-slate-500 text-center py-16">
                Escuchando tramas de red BLE y WiFi Direct...
              </div>
            ) : (
              packetLogs.map(log => (
                <div key={log.id} className="border-b border-slate-900 pb-1.5 last:border-0">
                  <div className="flex justify-between items-center">
                    <span className={`px-1 rounded text-[8px] uppercase font-bold ${
                      log.type === 'TX' ? 'bg-blue-950 text-blue-400' :
                      log.type === 'RX' ? 'bg-emerald-950 text-emerald-400' :
                      'bg-amber-950 text-amber-400'
                    }`}>
                      {log.type}
                    </span>
                    <span className="text-slate-500">{log.timestamp}</span>
                  </div>
                  <div className="text-slate-300 mt-1">
                    {log.sender} ➔ {log.receiver} | <span className="text-slate-400">{log.details}</span>
                  </div>
                  <div className="text-slate-500 text-[8px] mt-0.5 flex gap-2">
                    <span>ID: {log.messageId}</span>
                    <span>•</span>
                    <span>TTL: {log.ttl}</span>
                    <span>•</span>
                    <span>Protocolo: {log.protocol}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Database SQL structure inspector */}
        <div className="bg-slate-900 border border-slate-700/60 p-5 rounded-xl shadow-xl">
          <h3 className="font-display font-semibold text-slate-100 text-sm border-b border-slate-800 pb-2 mb-3 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-amber-500" />
            Estructuras del Servidor (PostgreSQL / DDL)
          </h3>

          <div className="flex bg-slate-950 p-1.5 rounded-lg border border-slate-800 mb-3 gap-1">
            {Object.keys(sqlSchemas).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveSchemaTab(tab as any)}
                className={`flex-1 text-center py-1 text-[10px] font-semibold rounded uppercase tracking-wider transition-colors ${
                  activeSchemaTab === tab
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.split('_')[0]}
              </button>
            ))}
          </div>

          <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-[9px] font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-[160px]">
            {sqlSchemas[activeSchemaTab]}
          </pre>
        </div>
      </div>
    </div>
  );
}
