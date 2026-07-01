import React, { useState, useEffect } from 'react';
import { 
  Database, RefreshCw, Send, CheckCircle2, Clock, MapPin, 
  Battery, HelpCircle, HardDrive, Cpu, Wifi, ShieldAlert 
} from 'lucide-react';
import { 
  getPendingPackets, getForwardStats, forwardToServer, 
  queuePacket, ForwardablePacket, ForwardResult 
} from '../services/StoreAndForwardService';
import { haversineDistance } from '../services/ProximityService';

interface StoreForwardPanelProps {
  userLat: number;
  userLng: number;
}

export default function StoreForwardPanel({ userLat, userLng }: StoreForwardPanelProps) {
  const [pendingList, setPendingList] = useState<ForwardablePacket[]>([]);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    pendingCount: 0,
    forwardedToday: 0,
    lastForwardAt: null,
    totalBytesForwarded: 0
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [myDeviceId, setMyDeviceId] = useState('');

  // Cargar deviceId
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('redsos_device_id') || 'Device_' + Math.floor(Math.random() * 10000);
      setMyDeviceId(stored);
    }
  }, []);

  // Refrescar datos
  const refreshData = async () => {
    try {
      const pending = await getPendingPackets();
      setPendingList(pending);
      setStats(getForwardStats());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);

    // Escuchar eventos globales de transmisiones exitosas en tiempo real
    const handleForwardEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as ForwardResult;
      setHistoryList(prev => [
        {
          id: detail.packetId,
          type: 'SOS',
          status: detail.success ? 'success' : 'failed',
          forwardedBy: detail.forwardedBy,
          timestamp: detail.timestamp,
          route: ['Origen', 'Vecino BLE', 'Tú (Gateway)', 'Servidor Cloudflare']
        },
        ...prev.slice(0, 19) // limitar a 20 items
      ]);
      refreshData();
    };

    window.addEventListener('redsos-packet-forwarded', handleForwardEvent);
    return () => {
      clearInterval(interval);
      window.removeEventListener('redsos-packet-forwarded', handleForwardEvent);
    };
  }, []);

  // Forzar sincronización manual
  const handleManualSync = async () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    if (!navigator.onLine) {
      setErrorMessage('Sin conexión a Internet. Conéctate para sincronizar con el servidor central.');
      return;
    }
    setIsSyncing(true);
    try {
      const pending = await getPendingPackets();
      let count = 0;
      for (const p of pending) {
        const res = await forwardToServer(p, myDeviceId);
        if (res.success) {
          count++;
          setHistoryList(prev => [
            {
              id: p.id,
              type: p.type,
              status: 'success',
              forwardedBy: myDeviceId,
              timestamp: new Date().toISOString(),
              route: [...p.hops, 'Tú', 'Servidor Cloudflare']
            },
            ...prev
          ]);
        }
      }
      setSuccessMessage(`✓ Sincronización finalizada. Se reenviaron ${count} paquetes de emergencia.`);
    } catch (err: any) {
      setErrorMessage(`Error en sincronización: ${err.message}`);
    } finally {
      setIsSyncing(false);
      refreshData();
    }
  };

  // Simular la recepción de un paquete mesh desde un vecino
  const handleSimulateIncomingPacket = async () => {
    const randomId = 'packet_' + Math.floor(Math.random() * 100000);
    const names = ['Carlos Pérez', 'María Rodríguez', 'Juan Garmendia', 'Ana Silva'];
    const descriptions = [
      'Colapso parcial de vivienda por sismo. 2 atrapados.',
      'Fuga de gas y principio de incendio tras temblor.',
      'Persona mayor atrapada con movilidad reducida.',
      'Se requiere asistencia de paramédicos por traumatismo.'
    ];

    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomDesc = descriptions[Math.floor(Math.random() * descriptions.length)];
    
    // Simular un vecino a unos 150 metros
    const latOffset = (Math.random() - 0.5) * 0.002;
    const lngOffset = (Math.random() - 0.5) * 0.002;
    const neighborLat = userLat + latOffset;
    const neighborLng = userLng + lngOffset;

    const encoder = new TextEncoder();
    const payload = {
      latitude: neighborLat,
      longitude: neighborLng,
      battery_level: Math.floor(20 + Math.random() * 60),
      description: randomDesc,
      user_name: randomName,
      connection_type: 'mesh_bluetooth',
      created_at: new Date().toISOString()
    };
    
    const signatureBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(payload)));
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const mockPacket: ForwardablePacket = {
      id: randomId,
      type: 'SOS',
      payload,
      originDeviceId: 'Neighbor_Node_' + Math.floor(Math.random() * 1000),
      originLat: neighborLat,
      originLng: neighborLng,
      createdAt: new Date().toISOString(),
      hops: ['Neighbor_Origin_Node', 'Relay_Hop_1'],
      ttl: 5,
      trustScore: 0.9,
      forwarded: false,
      forwardedAt: null,
      forwardedBy: null,
      signature: signatureHex
    };

    // Agregar a la cola local
    await queuePacket(mockPacket);
    setSuccessMessage(`⚡ Paquete mesh recibido de ${randomName} (${Math.round(haversineDistance(userLat, userLng, neighborLat, neighborLng))}m). Encolado en almacén táctico local.`);
    refreshData();
  };

  return (
    <div id="store-forward-panel-wrapper" className="space-y-6">
      {/* Header section */}
      <div className="bg-slate-900 border border-slate-700/60 p-5 rounded-xl shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-100 flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-400" />
              Almacén y Retransmisión Táctica (Store & Forward)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Cola de persistencia local resiliente para el transporte de alertas SOS multi-salto sin conectividad a internet.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSimulateIncomingPacket}
              className="bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 font-semibold px-3.5 py-1.5 rounded-lg transition-colors text-xs flex items-center gap-1.5 shadow"
            >
              <Cpu className="w-3.5 h-3.5 animate-pulse" /> Simular Paquete Mesh
            </button>
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-3.5 py-1.5 rounded-lg transition-colors text-xs flex items-center gap-1.5 shadow"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Sincronizar Cola
            </button>
          </div>
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

      {/* Grid panels stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-yellow-950/40 text-yellow-400 rounded-lg border border-yellow-900/30">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono block uppercase tracking-wider">Pendientes de Envío</span>
            <span className="text-xl font-bold font-mono text-yellow-400">{pendingList.length} paquetes</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-emerald-950/40 text-emerald-400 rounded-lg border border-emerald-900/30">
            <CheckCircle2 className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono block uppercase tracking-wider">Retransmitidos Hoy</span>
            <span className="text-xl font-bold font-mono text-emerald-400">+{stats.forwardedToday || 0} SOS</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-sky-950/40 text-sky-400 rounded-lg border border-sky-900/30">
            <Wifi className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono block uppercase tracking-wider">Ancho de Banda Utilizado</span>
            <span className="text-xl font-bold font-mono text-sky-400">
              {stats.totalBytesForwarded > 1024 
                ? `${(stats.totalBytesForwarded / 1024).toFixed(1)} KB` 
                : `${stats.totalBytesForwarded} B`}
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-purple-950/40 text-purple-400 rounded-lg border border-purple-900/30">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono block uppercase tracking-wider">ID del Dispositivo</span>
            <span className="text-xs font-mono font-semibold text-slate-300 truncate max-w-[120px] block" title={myDeviceId}>
              {myDeviceId || 'Cargando...'}
            </span>
          </div>
        </div>
      </div>

      {/* Main split dashboard: local pending queue + transaction logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Local Storage / SQLite Pendientes */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h4 className="font-display font-semibold text-sm text-slate-200 border-b border-slate-800 pb-2 flex justify-between items-center">
            <span>Paquetes en Almacén Local (Pendientes)</span>
            <span className="bg-slate-850 border border-slate-700 font-mono px-2 py-0.5 rounded text-[10px] text-slate-400">
              Persistencia: IndexedDB
            </span>
          </h4>

          {pendingList.length === 0 ? (
            <div className="text-center py-12 bg-slate-950/40 border border-slate-800/60 rounded-xl">
              <Database className="w-10 h-10 text-slate-700 mx-auto mb-2 stroke-1" />
              <p className="text-xs text-slate-400 px-4">
                El almacén local está vacío. No hay alertas SOS pendientes de propagar.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {pendingList.map((packet) => (
                <div key={packet.id} className="bg-slate-950 p-3.5 rounded-lg border border-slate-800/80 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-semibold text-slate-200 font-display text-xs">
                        {packet.payload.user_name || 'Alerta Anónima'}
                      </span>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {packet.id}</p>
                    </div>
                    <span className="px-2 py-0.5 bg-yellow-950 text-yellow-400 border border-yellow-900/30 rounded text-[9px] font-mono animate-pulse">
                      PENDIENTE (TTL: {packet.ttl})
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 italic">
                    "{packet.payload.description || 'Sin descripción descriptiva'}"
                  </p>

                  <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-blue-400" />
                      {packet.payload.latitude.toFixed(5)}, {packet.payload.longitude.toFixed(5)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Battery className="w-3.5 h-3.5 text-emerald-400" /> {packet.payload.battery_level}%
                    </span>
                    <span className="text-slate-500">
                      {new Date(packet.createdAt).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Route progress */}
                  <div className="bg-slate-900 p-2 rounded text-[10px] font-mono border border-slate-800/60 flex items-center gap-1 flex-wrap">
                    <span className="text-indigo-400 font-bold">Ruta:</span>
                    {packet.hops.map((hop, idx) => (
                      <React.Fragment key={idx}>
                        <span className="text-slate-300 shrink-0">{hop.replace('Device_', 'Disp_')}</span>
                        <span className="text-slate-600">→</span>
                      </React.Fragment>
                    ))}
                    <span className="text-yellow-400 font-bold animate-pulse shrink-0">Tú (Almacén)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transaction Logs / History */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h4 className="font-display font-semibold text-sm text-slate-200 border-b border-slate-800 pb-2">
            Historial de Tránsito en Red
          </h4>

          {historyList.length === 0 ? (
            <div className="text-center py-12 bg-slate-950/40 border border-slate-800/60 rounded-xl">
              <Send className="w-10 h-10 text-slate-700 mx-auto mb-2 stroke-1" />
              <p className="text-xs text-slate-400 px-4">
                No hay transacciones registradas en esta sesión. Esperando transferencia de paquetes mesh.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {historyList.map((item, idx) => (
                <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${item.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="font-mono text-[10px] text-slate-400">ID: {item.id.slice(0, 12)}...</span>
                    </div>
                    <span className={`text-[10px] font-bold ${item.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {item.status === 'success' ? 'TRANSMITIDO' : 'FALLIDO'}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-300 font-mono flex items-center justify-between">
                    <span>Forwarded By: {item.forwardedBy.replace('Device_', 'Disp_')}</span>
                    <span className="text-[10px] text-slate-500">{new Date(item.timestamp).toLocaleTimeString()}</span>
                  </div>

                  {/* Flow visual path */}
                  <div className="flex items-center gap-1 text-[9px] font-mono text-slate-400 flex-wrap bg-slate-900/60 p-1.5 rounded border border-slate-800">
                    {item.route.map((node: string, nIdx: number) => (
                      <React.Fragment key={nIdx}>
                        <span className={node === 'Servidor Cloudflare' ? 'text-indigo-400 font-bold' : ''}>{node}</span>
                        {nIdx < item.route.length - 1 && <span className="text-slate-600">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
