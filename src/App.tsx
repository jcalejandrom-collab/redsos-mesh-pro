import React, { useState, useEffect } from 'react';
import { MeshNode, EmergencyAlert, ChatMessage } from './types';
import NetworkMap from './components/NetworkMap';
import PanicPanel from './components/PanicPanel';
import ChatPanel from './components/ChatPanel';
import BrigadePanel from './components/BrigadePanel';
import SimulationPanel from './components/SimulationPanel';
import DocPanel from './components/DocPanel';
import IncidentPanel from './components/IncidentPanel';
import CameraPanel from './components/CameraPanel';
import AdvancedPanel from './components/AdvancedPanel';
import DashboardAdmin from './components/DashboardAdmin';
import Logo from './components/Logo';
import { 
  Wifi, 
  WifiOff, 
  Radio, 
  AlertTriangle, 
  Battery, 
  Map, 
  MessageSquare, 
  Shield, 
  Activity, 
  BookOpen, 
  Volume2, 
  Power, 
  Clock, 
  RefreshCw,
  ShieldAlert,
  Video,
  Sliders
} from 'lucide-react';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'map' | 'sos' | 'chat' | 'brigade' | 'incidents' | 'cameras' | 'sim' | 'advanced' | 'docs' | 'admin'>('map');

  // Network & System Mode State
  const [connectionMode, setConnectionMode] = useState<'internet' | 'mesh' | 'partial'>('internet');
  const [isDesastreMode, setIsDesastreMode] = useState(false);
  const [currentBattery, setCurrentBattery] = useState(94);
  const [utcTime, setUtcTime] = useState('');

  // Simulation/Incident states
  const [isJammed, setIsJammed] = useState(false);
  const [isFallDetected, setIsFallDetected] = useState(false);

  // User Simulation GPS
  const [userLat, setUserLat] = useState(19.4326);
  const [userLng, setUserLng] = useState(-99.1332);

  // Entities loaded from Server
  const [nodes, setNodes] = useState<MeshNode[]>([]);
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Offline buffer storage
  const [offlineMessagesBuffer, setOfflineMessagesBuffer] = useState<ChatMessage[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Selected node for map details sidebar
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Dynamic UTC Time tick
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch telemetry and server state on mount & periodic intervals
  const fetchServerState = async () => {
    try {
      const resNodes = await fetch('/api/nodes');
      const dataNodes = await resNodes.json();
      setNodes(dataNodes);

      const resAlerts = await fetch('/api/alerts');
      const dataAlerts = await resAlerts.json();
      setAlerts(dataAlerts);

      const resMessages = await fetch('/api/messages');
      const dataMessages = await resMessages.json();
      setMessages(dataMessages);
    } catch (err) {
      console.warn("Server connection failed. Using offline simulated state.", err);
    }
  };

  useEffect(() => {
    fetchServerState();
    const timer = setInterval(fetchServerState, 5000);
    return () => clearInterval(timer);
  }, []);

  // Handle Automatic Sincronización when internet is restored
  useEffect(() => {
    if ((connectionMode === 'internet' || connectionMode === 'partial') && offlineMessagesBuffer.length > 0) {
      syncOfflineData();
    }
  }, [connectionMode, offlineMessagesBuffer]);

  const syncOfflineData = async () => {
    setIsSyncing(true);
    console.log(`[Sync Engine] Restableciendo conectividad. Sincronizando ${offlineMessagesBuffer.length} mensajes fuera de línea...`);
    
    for (const msg of offlineMessagesBuffer) {
      try {
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender_name: msg.sender_name,
            content: msg.content + " [SINCRONIZADO DE COLA MESH]",
            type: msg.type,
            ttl: msg.ttl,
            hops: msg.hops,
            hash_sha256: msg.hash_sha256,
            is_synced: true
          })
        });
      } catch (err) {
        console.error("Failed to sync message packet:", err);
      }
    }

    // Clear buffer after sync completes
    setOfflineMessagesBuffer([]);
    setIsSyncing(false);
    fetchServerState();
  };

  // Trigger Panic SOS Alert
  const handleTriggerSOS = async (payload: Partial<EmergencyAlert>) => {
    if (connectionMode === 'mesh') {
      // Offline mode: store in local state, alert user
      const tempAlert: EmergencyAlert = {
        id: `alert-temp-${Date.now()}`,
        user_name: payload.user_name || "Tú (Mi Nodo)",
        latitude: payload.latitude || userLat,
        longitude: payload.longitude || userLng,
        battery_level: currentBattery,
        connection_type: 'mesh_bluetooth',
        status: 'active',
        description: payload.description || "Alerta de pánico disparada en Modo fuera de línea",
        audio_url: payload.audio_url || null,
        created_at: new Date().toISOString()
      };
      setAlerts(prev => [tempAlert, ...prev]);
      alert("⚠️ ALERTA SOS REGISTRADA EN COLA MESH. Su teléfono está propagando continuamente esta alerta a los nodos de rescate circundantes por Bluetooth LE.");
      return;
    }

    // Direct HTTP push when online or hybrid
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        fetchServerState();
      }
    } catch (err) {
      console.error("SOS Trigger failed", err);
    }
  };

  // Chat message send handler
  const handleSendMessage = async (content: string, type: 'text' | 'location' | 'audio' = 'text') => {
    const uuid = `mesh-msg-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const newMsg: ChatMessage = {
      id: `m-temp-${Date.now()}`,
      sender_name: "Tú (Mi Nodo)",
      content,
      type,
      uuid,
      ttl: 5,
      hops: 0,
      hash_sha256: `sha256-${Math.random().toString(36).substring(7)}`,
      is_synced: connectionMode !== 'mesh',
      created_at: timestamp
    };

    // If fully offline, buffer the message
    if (connectionMode === 'mesh') {
      setOfflineMessagesBuffer(prev => [...prev, newMsg]);
      setMessages(prev => [...prev, newMsg]);
      return;
    }

    // Push online to central server
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_name: "Tú (Mi Nodo)",
          content,
          type,
          ttl: 5,
          hops: 0,
          hash_sha256: newMsg.hash_sha256,
          is_synced: true
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchServerState();
      }
    } catch (err) {
      console.error("Failed to send message", err);
    }
  };

  // Simulation controls trigger updates
  const handleAddOrUpdateNode = async (payload: any) => {
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        fetchServerState();
      }
    } catch (err) {
      console.error("Add/Update node failed", err);
    }
  };

  const handleRemoveNode = async (id: string) => {
    try {
      await fetch(`/api/nodes/${id}`, { method: 'DELETE' });
      fetchServerState();
    } catch (err) {
      console.error("Remove node failed", err);
    }
  };

  // Fall sensor trigger simulation
  const handleTriggerFall = () => {
    setIsFallDetected(true);
  };

  const handleDismissFall = () => {
    setIsFallDetected(false);
  };

  const handleConfirmFallSOS = () => {
    setIsFallDetected(false);
    handleTriggerSOS({
      user_name: "Detector de Caídas (Mi Nodo)",
      latitude: userLat,
      longitude: userLng,
      battery_level: currentBattery,
      connection_type: 'mesh_bluetooth',
      description: "⚠️ CAÍDA SEVERA DETECTADA - El usuario no responde tras fuerte desaceleración."
    });
  };

  // Battery critical simulation trigger
  const handleTriggerBatteryCritica = () => {
    setCurrentBattery(5);
    setIsDesastreMode(true);
    alert("🔋 BATERÍA CRÍTICA AL 5%. El sistema ha activado automáticamente el Modo Desastre, maximizando los intervalos de beaconing y apagando la pantalla principal para salvar energía.");
  };

  // Signal jamming simulation toggle
  const handleTriggerSignalJammer = () => {
    setIsJammed(!isJammed);
  };

  // Set simulation GPS location manually from map
  const handleUpdateUserCoords = (lat: number, lng: number) => {
    setUserLat(lat);
    setUserLng(lng);
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${
      isDesastreMode 
        ? 'bg-[#0a0500] text-amber-100 border-4 border-amber-600/40' 
        : 'bg-[#0f172a] text-slate-100'
    }`}>
      
      {/* Dynamic Fall Alarm Warning Bar */}
      {isFallDetected && (
        <div className="bg-red-950/90 backdrop-blur border-b-2 border-red-500 p-4 text-center sticky top-0 z-50 animate-bounce flex flex-col sm:flex-row items-center justify-center gap-4 shadow-xl">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-500 animate-pulse" />
            <span className="font-display font-black text-sm text-red-200">
              🚨 DETECTOR DE MOVIMIENTO: ¡SE DETECTÓ UNA CAÍDA FUERTE!
            </span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleDismissFall}
              className="bg-slate-850 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2 rounded-lg"
            >
              Estoy bien (Descartar)
            </button>
            <button 
              onClick={handleConfirmFallSOS}
              className="bg-red-600 hover:bg-red-500 text-white text-xs font-black px-5 py-2 rounded-lg shadow-lg shadow-red-950/40"
            >
              DISPARAR ALERTA YA
            </button>
          </div>
        </div>
      )}

      {/* Main Top Header Navigation */}
      <header className={`p-4 border-b ${
        isDesastreMode ? 'bg-[#150a00] border-amber-800/40' : 'bg-[#1e293b]/70 border-slate-800'
      } backdrop-blur-md sticky top-0 z-40`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Logo brand & desastre banner */}
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              <Logo size="sm" showText={false} animate={true} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-black tracking-wider text-xl uppercase">RedSOS Mesh</h1>
                {isDesastreMode && (
                  <span className="bg-amber-600 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse">
                    Modo Desastre
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Plataforma Civil Inteligente de Emergencias</p>
            </div>
          </div>

          {/* Connection modes switcher & status metrics */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            
            {/* Status badges */}
            <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-1.5 rounded-lg border border-slate-800 text-[11px] font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{utcTime}</span>
            </div>

            <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-1.5 rounded-lg border border-slate-800 text-[11px] font-mono">
              <Battery className={`w-4 h-4 ${currentBattery > 20 ? 'text-emerald-400' : 'text-red-500 animate-pulse'}`} />
              <span>{currentBattery}%</span>
            </div>

            {/* Connection state dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setConnectionMode('internet')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
                  connectionMode === 'internet' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Sincronización central total con Internet"
              >
                Con Internet
              </button>
              <button
                onClick={() => setConnectionMode('mesh')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
                  connectionMode === 'mesh' 
                    ? 'bg-amber-600 text-slate-950' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Comunicación Bluetooth & WiFi Direct fuera de línea"
              >
                Mesh
              </button>
              <button
                onClick={() => setConnectionMode('partial')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
                  connectionMode === 'partial' 
                    ? 'bg-indigo-600 text-white' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Usa ambos métodos para maximizar cobertura"
              >
                Híbrido
              </button>
            </div>

            {/* Modo desastre big switch toggle */}
            <button
              onClick={() => setIsDesastreMode(!isDesastreMode)}
              className={`p-2 rounded-lg border ${
                isDesastreMode 
                  ? 'bg-amber-600/20 border-amber-500 text-amber-400 animate-pulse' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Alternar Modo Desastre para optimización energética"
            >
              <Power className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Sync Alert Banner */}
      {isSyncing && (
        <div className="bg-blue-950/80 border-b border-blue-800 text-center py-2 text-xs font-mono text-blue-300 animate-pulse">
          ⚡ [Sincronización] Internet detectado. Transfiriendo cola de mensajes almacenados en la red Mesh local...
        </div>
      )}

      {/* Main Workspace Frame container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* Workspace Tab navigation bar */}
        <div className="flex flex-wrap border-b border-slate-800 bg-slate-950/60 p-1.5 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab('map')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'map'
                ? isDesastreMode ? 'bg-amber-600 text-[#0a0500]' : 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span>Mapa</span>
          </button>

          <button
            onClick={() => setActiveTab('sos')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'sos'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>SOS</span>
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'chat'
                ? isDesastreMode ? 'bg-amber-600 text-[#0a0500]' : 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>

          <button
            onClick={() => setActiveTab('brigade')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'brigade'
                ? isDesastreMode ? 'bg-amber-600 text-[#0a0500]' : 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Brigadas</span>
          </button>

          <button
            onClick={() => setActiveTab('incidents')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'incidents'
                ? isDesastreMode ? 'bg-amber-600 text-[#0a0500]' : 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Incidentes</span>
          </button>

          <button
            onClick={() => setActiveTab('cameras')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'cameras'
                ? isDesastreMode ? 'bg-amber-600 text-[#0a0500]' : 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>CCTV/Drones</span>
          </button>

          <button
            onClick={() => setActiveTab('sim')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'sim'
                ? isDesastreMode ? 'bg-amber-600 text-[#0a0500]' : 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Simulador</span>
          </button>

          <button
            onClick={() => setActiveTab('advanced')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'advanced'
                ? isDesastreMode ? 'bg-amber-600 text-[#0a0500]' : 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Ajustes</span>
          </button>

          <button
            onClick={() => setActiveTab('admin')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'admin'
                ? 'bg-red-600 text-white shadow shadow-red-950/40'
                : 'text-red-400 hover:bg-red-950/20 hover:text-red-300 border border-red-500/10'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Base Mando</span>
          </button>

          <button
            onClick={() => setActiveTab('docs')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'docs'
                ? isDesastreMode ? 'bg-amber-600 text-[#0a0500]' : 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Especificación</span>
          </button>
        </div>

        {/* Tab view components mounting switcher */}
        <div className="transition-opacity duration-200">
          {activeTab === 'map' && (
            <NetworkMap 
              nodes={nodes}
              alerts={alerts}
              userLat={userLat}
              userLng={userLng}
              onUpdateUserCoords={handleUpdateUserCoords}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              isDesastreMode={isDesastreMode}
            />
          )}

          {activeTab === 'sos' && (
            <PanicPanel 
              onTriggerSOS={handleTriggerSOS}
              alerts={alerts}
              userLat={userLat}
              userLng={userLng}
              currentBattery={currentBattery}
              connectionMode={connectionMode}
            />
          )}

          {activeTab === 'chat' && (
            <ChatPanel 
              messages={messages}
              onSendMessage={handleSendMessage}
              userLat={userLat}
              userLng={userLng}
            />
          )}

          {activeTab === 'brigade' && (
            <BrigadePanel />
          )}

          {activeTab === 'incidents' && (
            <IncidentPanel />
          )}

          {activeTab === 'cameras' && (
            <CameraPanel />
          )}

          {activeTab === 'advanced' && (
            <AdvancedPanel />
          )}

          {activeTab === 'admin' && (
            <DashboardAdmin />
          )}

          {activeTab === 'sim' && (
            <SimulationPanel 
              nodes={nodes}
              onAddOrUpdateNode={handleAddOrUpdateNode}
              onRemoveNode={handleRemoveNode}
              onTriggerFall={handleTriggerFall}
              onTriggerBatteryCritica={handleTriggerBatteryCritica}
              onTriggerSignalJammer={handleTriggerSignalJammer}
              isJammed={isJammed}
              isFallDetected={isFallDetected}
            />
          )}

          {activeTab === 'docs' && (
            <DocPanel />
          )}
        </div>
      </main>

      {/* Visual footer details */}
      <footer className={`p-4 mt-auto text-center border-t text-[10px] ${
        isDesastreMode ? 'bg-[#0a0500] border-amber-800/40 text-amber-500' : 'bg-[#0f172a] border-slate-800 text-slate-400'
      }`}>
        <p>© 2026 RedSOS Mesh Protocol • Red de Emergencia Civil Distribuida de Alta Disponibilidad • Cifrado Local AES-256</p>
      </footer>
    </div>
  );
}
