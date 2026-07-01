import React, { useState, useEffect } from 'react';
import { MeshNode, EmergencyAlert, ChatMessage } from './types';
import NetworkMap from './components/NetworkMap';
import OfflineMap from './components/OfflineMap';
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
import ProximityAlert from './components/ProximityAlert';
import StoreForwardPanel from './components/StoreForwardPanel';
import OnboardingBrigadista from './components/OnboardingBrigadista';
import ProximityBanner from './components/ProximityBanner';
import { requestNotificationPermission } from './services/ProximityAlertService';
import { sendCriticalAlert } from './services/ChatNotificationService';
import { startForwardQueue } from './services/StoreAndForwardService';
import LoginScreen from './components/LoginScreen';
import { initAuth, logout, getCurrentUser, createDirectSOSInFirestore } from './utils/firebase';
import { API_URL, WORKER_URL } from './config';

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
  Sliders,
  Database,
  Crosshair,
  LogOut
} from 'lucide-react';

export type AuthState = 'loading' | 'unauthenticated' | 'authenticated' | 'emergency_guest';

export default function App() {
  // Global Toast Notification State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Authentication State
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authUser, setAuthUser] = useState<any>(null);

  // Navigation State
  const [activeTab, setActiveTab] = useState<'map' | 'offlinemap' | 'sos' | 'chat' | 'brigade' | 'incidents' | 'cameras' | 'sim' | 'advanced' | 'docs' | 'admin' | 'storeforward' | 'tactical'>('sos');

  // Network & System Mode State
  const [connectionMode, setConnectionMode] = useState<'internet' | 'mesh' | 'partial'>('internet');
  const [isDesastreMode, setIsDesastreMode] = useState(false);
  const [currentBattery, setCurrentBattery] = useState(94);
  const [utcTime, setUtcTime] = useState('');

  // Simulation/Incident states
  const [isJammed, setIsJammed] = useState(false);
  const [isFallDetected, setIsFallDetected] = useState(false);
  const [userRole, setUserRole] = useState<'user' | 'brigadist' | 'operator'>('user');

  // User Simulation GPS
  const [userLat, setUserLat] = useState(10.0735);
  const [userLng, setUserLng] = useState(-69.3250);

  // User identification info
  const [deviceId] = useState<string>(() => {
    const existing = localStorage.getItem('redsos_device_id');
    if (existing) return existing;
    const newId = `Device_${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem('redsos_device_id', newId);
    return newId;
  });
  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem('admin_username') || "Civil RedSOS";
  });

  // Observador de la sesión de autenticación
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setAuthUser(user);
        setAuthState('authenticated');
        if (user.displayName) {
          setUserName(user.displayName);
          localStorage.setItem('admin_username', user.displayName);
        }
      },
      () => {
        setAuthState('unauthenticated');
      }
    );
    return () => unsubscribe();
  }, []);

  // Solicitar permiso de notificaciones al cargar la app por primera vez (no agresivo)
  useEffect(() => {
    const timer = setTimeout(() => {
      requestNotificationPermission();
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Sincronizar periódicamente el nombre de usuario de localStorage por si cambia en Onboarding
  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem('admin_username');
      if (stored && stored !== userName) {
        setUserName(stored);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    const interval = setInterval(handleStorageChange, 2000);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [userName]);

  // Entities loaded from Server
  const [nodes, setNodes] = useState<MeshNode[]>([]);
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Offline buffer storage
  const [offlineMessagesBuffer, setOfflineMessagesBuffer] = useState<ChatMessage[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Selected node for map details sidebar
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // States for Brigadista Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isBrigadistVerified, setIsBrigadistVerified] = useState(() => {
    return localStorage.getItem('redsos_brigadist_verified') === 'true';
  });

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

  // Hook for severe seismic trigger events to switch map
  useEffect(() => {
    (window as any).onSeismicSevereTrigger = () => {
      setActiveTab('offlinemap');
      setIsDesastreMode(true);
    };
    return () => {
      delete (window as any).onSeismicSevereTrigger;
    };
  }, []);

  // Fetch telemetry and server state on mount & periodic intervals
  const fetchServerState = async () => {
    try {
      const resNodes = await fetch(`${API_URL}/api/nodes`);
      const dataNodes = await resNodes.json();
      setNodes(dataNodes);

      const resAlerts = await fetch(`${API_URL}/api/alerts`);
      const dataAlerts = await resAlerts.json();
      setAlerts(dataAlerts);

      const resMessages = await fetch(`${API_URL}/api/messages`);
      const dataMessages = await resMessages.json();
      setMessages(dataMessages);
    } catch (err) {
      console.warn("Server connection failed. Using offline simulated state.", err);
    }
  };

  useEffect(() => {
    fetchServerState();
    const timer = setInterval(fetchServerState, 5000);

    // Iniciar cola automática de Store & Forward
    const myId = localStorage.getItem('redsos_device_id') || `Device_${Math.floor(Math.random() * 10000)}`;
    const stopQueue = startForwardQueue(myId, (res) => {
      console.log("[StoreAndForward] Auto-forwarded packet via background thread:", res);
      fetchServerState();
    });

    return () => {
      clearInterval(timer);
      stopQueue();
    };
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
        await fetch(`${API_URL}/api/messages`, {
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
    // Generate an alert ID and details for Google Chat
    const alertId = payload.id || `alert-temp-${Date.now()}`;
    const chatAlert = {
      id: alertId,
      user_name: payload.user_name || "Tú (Mi Nodo)",
      latitude: payload.latitude || userLat,
      longitude: payload.longitude || userLng,
      battery_level: payload.battery_level || currentBattery,
      description: payload.description || "Alerta de pánico disparada",
      priority: 'CRITICAL' as const,
      status: payload.status || 'active'
    };

    // Attempt to notify Google Chat Space using sendCriticalAlert (failures/no-webhook handled gracefully inside)
    const storedWebhook = localStorage.getItem('redsos_webhook_url') || '';
    sendCriticalAlert({
      id: alertId,
      nodeId: payload.user_name || "Tú (Mi Nodo)",
      description: payload.description || "Alerta de pánico disparada",
      batteryLevel: payload.battery_level || currentBattery,
      lat: payload.latitude || userLat,
      lng: payload.longitude || userLng,
      priority: 'CRITICAL',
      timestamp: new Date().toISOString()
    }, storedWebhook).catch(err => {
      console.error("Google Chat Notification failed:", err);
    });

    if (connectionMode === 'mesh') {
      // Offline mode: store in local state, alert user
      const tempAlert: EmergencyAlert = {
        id: alertId,
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
      setToastMessage({
        text: "⚠️ ALERTA SOS REGISTRADA EN COLA MESH. Su teléfono está propagando continuamente esta alerta a los nodos de rescate circundantes por Bluetooth LE.",
        type: 'warning'
      });
      return;
    }

    // Direct HTTP push when online or hybrid
    try {
      // 1. Guardar en Firestore para persistencia duradera y sincronización en tiempo real
      await createDirectSOSInFirestore({
        id: alertId,
        user_name: payload.user_name || "Tú (Mi Nodo)",
        latitude: payload.latitude || userLat,
        longitude: payload.longitude || userLng,
        battery_level: payload.battery_level || currentBattery,
        connection_type: payload.connection_type || 'internet',
        status: payload.status || 'active',
        description: payload.description || "Alerta de pánico disparada",
        userId: authUser?.uid || ""
      });

      // 2. Notificar al Cloudflare Worker API para disparar flujos centralizados de colas de prioridades
      const res = await fetch(`${API_URL}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          id: alertId,
          user_name: payload.user_name || "Tú (Mi Nodo)",
          latitude: payload.latitude || userLat,
          longitude: payload.longitude || userLng,
          battery_level: payload.battery_level || currentBattery,
          status: payload.status || 'active',
          description: payload.description || "Alerta de pánico disparada",
          userId: authUser?.uid || ""
        })
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
      const res = await fetch(`${API_URL}/api/messages`, {
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
      const res = await fetch(`${API_URL}/api/nodes`, {
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
      await fetch(`${API_URL}/api/nodes/${id}`, { method: 'DELETE' });
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
    setToastMessage({
      text: "🔋 BATERÍA CRÍTICA AL 5%. El sistema ha activado automáticamente el Modo Desastre, maximizando los intervalos de beaconing y apagando la pantalla principal para salvar energía.",
      type: 'error'
    });
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

  // Force 'sos' tab if emergency guest
  useEffect(() => {
    if (authState === 'emergency_guest') {
      setActiveTab('sos');
    }
  }, [authState]);

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#090d16] text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500 mb-4"></div>
        <p className="font-mono text-xs tracking-widest uppercase text-slate-400">Verificando sistema RedSOS...</p>
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    return (
      <LoginScreen
        onLoginSuccess={(user, token) => {
          setAuthUser(user);
          setAuthState('authenticated');
          if (user.displayName) {
            setUserName(user.displayName);
            localStorage.setItem('admin_username', user.displayName);
          }
        }}
        onEmergencyGuest={() => {
          setAuthState('emergency_guest');
          setActiveTab('sos');
        }}
      />
    );
  }

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

            {/* Perfil de Rol Táctico */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px]">
              <span className="text-[9px] font-bold text-slate-500 uppercase px-1.5 select-none">Rol:</span>
              <button
                onClick={() => setUserRole('user')}
                className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${
                  userRole === 'user'
                    ? 'bg-emerald-600 text-white font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Civil
              </button>
              <button
                onClick={() => setUserRole('brigadist')}
                className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${
                  userRole === 'brigadist'
                    ? 'bg-amber-600 text-[#0f0a00] font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Brigada
              </button>
              <button
                onClick={() => setUserRole('operator')}
                className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${
                  userRole === 'operator'
                    ? 'bg-indigo-600 text-white font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Operador
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

            {/* Logout button */}
            {authState === 'authenticated' && (
              <button
                onClick={async () => {
                  await logout();
                  setAuthState('unauthenticated');
                  setAuthUser(null);
                }}
                className="p-2 rounded-lg border border-red-500/20 bg-red-950/10 text-red-400 hover:bg-red-950/30 hover:text-red-300 flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sync Alert Banner */}
      {isSyncing && (
        <div className="bg-blue-950/80 border-b border-blue-800 text-center py-2 text-xs font-mono text-blue-300 animate-pulse">
          ⚡ [Sincronización] Internet detectado. Transfiriendo cola de mensajes almacenados en la red Mesh local...
        </div>
      )}

      {/* Brigadista Pending Onboarding Banner */}
      {userRole === 'brigadist' && !isBrigadistVerified && (
        <div className="bg-amber-950 border-b border-amber-800 text-center py-3 px-4 text-xs font-sans text-amber-300 flex flex-col sm:flex-row items-center justify-center gap-2">
          <span>⚠️ <strong>Identidad táctica no inicializada:</strong> Para poder firmar reportes de rescate SOS con criptografía Ed25519 y habilitar la detección de balizas en segundo plano, debe crear sus llaves oficiales.</span>
          <button 
            onClick={() => setShowOnboarding(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-3 py-1 rounded text-[10px] uppercase tracking-wider transition-all cursor-pointer"
          >
            Realizar Onboarding
          </button>
        </div>
      )}

      {toastMessage && (
        <div className={`border-b text-center py-3 px-4 text-xs font-mono flex items-center justify-center gap-3 transition-all ${
          toastMessage.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-800 text-emerald-300' 
            : toastMessage.type === 'warning'
            ? 'bg-amber-950/90 border-amber-800 text-amber-300 animate-pulse'
            : 'bg-red-950/90 border-red-800 text-red-300'
        }`}>
          <span>{toastMessage.text}</span>
          <button 
            onClick={() => setToastMessage(null)}
            className="shrink-0 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white px-2 py-1 rounded text-[10px] uppercase font-bold border border-slate-800 transition-colors cursor-pointer"
          >
            Entendido
          </button>
        </div>
      )}

      {/* Main Workspace Frame container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* Workspace Tab navigation bar */}
        {authState !== 'emergency_guest' && (
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
            <span>Mapa SVG</span>
          </button>

          <button
            onClick={() => setActiveTab('offlinemap')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'offlinemap'
                ? isDesastreMode ? 'bg-amber-600 text-[#0a0500]' : 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Map className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            <span>Mapa Offline</span>
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
            onClick={() => setActiveTab('storeforward')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'storeforward'
                ? isDesastreMode ? 'bg-amber-600 text-[#0a0500]' : 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            <span>Store & Forward</span>
          </button>

          <button
            onClick={() => setActiveTab('tactical')}
            className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
              activeTab === 'tactical'
                ? isDesastreMode ? 'bg-amber-600 text-[#0a0500]' : 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5 text-red-500" />
            <span>Radar Táctico</span>
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
        )}

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

          {activeTab === 'offlinemap' && (
            <OfflineMap 
              nodes={nodes}
              alerts={alerts}
              userLat={userLat}
              userLng={userLng}
              onNodeClick={(nodeId) => {
                setSelectedNodeId(nodeId);
                setActiveTab('map');
              }}
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

          {activeTab === 'storeforward' && (
            <StoreForwardPanel userLat={userLat} userLng={userLng} />
          )}

          {activeTab === 'tactical' && (
            <ProximityAlert userLat={userLat} userLng={userLng} userRole={userRole} inlineLayout={true} />
          )}
        </div>
      </main>

      {/* Global Floating Proximity Warning for Civilians */}
      <ProximityBanner
        userLat={userLat}
        userLng={userLng}
        userId={deviceId}
        userName={userName}
        onSelectTab={setActiveTab}
      />

      {activeTab !== 'tactical' && (
        <ProximityAlert userLat={userLat} userLng={userLng} userRole={userRole} />
      )}

      {/* Onboarding Brigadista Modal Overlay */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl my-8">
            <OnboardingBrigadista 
              onComplete={(data) => {
                setIsBrigadistVerified(true);
                setShowOnboarding(false);
              }}
              onCancel={() => setShowOnboarding(false)}
            />
          </div>
        </div>
      )}

      {/* Visual footer details */}
      <footer className={`p-4 mt-auto text-center border-t text-[10px] ${
        isDesastreMode ? 'bg-[#0a0500] border-amber-800/40 text-amber-500' : 'bg-[#0f172a] border-slate-800 text-slate-400'
      }`}>
        <p>© 2026 RedSOS Mesh Protocol • Red de Emergencia Civil Distribuida de Alta Disponibilidad • Cifrado Local AES-256</p>
      </footer>
    </div>
  );
}
