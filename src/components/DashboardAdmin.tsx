import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { 
  Shield, 
  Lock, 
  Activity, 
  Battery, 
  Wifi, 
  WifiOff, 
  AlertTriangle, 
  Radio, 
  Compass, 
  TrendingDown, 
  History, 
  RefreshCw, 
  Users,
  Search,
  CheckCircle,
  Eye,
  Sliders,
  Sparkles,
  Navigation,
  FileSpreadsheet,
  Download,
  Database,
  CloudLightning,
  LogOut,
  MessageSquare,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import NetworkMap from './NetworkMap';
import { initAuth, googleSignIn, logout } from '../utils/firebase';
import { createRedSOSSpreadsheet, appendAlertsToSheet, SheetsAlertRow } from '../utils/googleSheets';
import { sendCriticalAlert, getCircuitBreakerStatus, resetCircuitBreaker } from '../services/ChatNotificationService';
import { startMeshMonitor, MeshLayerStatus } from '../services/MeshOrchestrator';
import { hashAdminToken } from '../services/CryptoService';

import { API_URL, WORKER_URL } from '../config';


interface FailedPacket {
  id: string;
  sourceNode: string;
  destNode: string;
  timestamp: string;
  reason: string;
  lossPercentage: number;
  hops: number;
}

interface AdminSystemHealth {
  networkHealth: {
    activeNodes: number;
    totalNodes: number;
    percentage: number;
    status: string;
  };
  batteryMetrics: {
    average: number;
    criticalCount: number;
  };
  packetLoss: {
    averageLoss: number;
    status: string;
  };
  emergencyAlerts: any[];
  failedPackets: FailedPacket[];
  globalNodeRange: number;
}

interface AuditedMessage {
  id: string;
  sender_name: string;
  content: string;
  type: string;
  uuid: string;
  ttl: number;
  hops: number;
  hash_sha256: string;
  is_synced: boolean;
  created_at: string;
  verifiedIntegrity: boolean;
  shaHashMatched: boolean;
  decryptionKeyUsed: string;
}

function Sparkline({ data, color = '#10b981' }: { data: number[]; color?: string }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min === 0 ? 1 : max - min;
  const width = 100;
  const height = 30;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="w-16 h-6 shrink-0" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default function DashboardAdmin() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [adminToken, setAdminToken] = useState<string>('');
  const [inputToken, setInputToken] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  
  // Dashboard data states
  const [healthData, setHealthData] = useState<AdminSystemHealth | null>(null);
  const [auditedMsgs, setAuditedMsgs] = useState<AuditedMessage[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);
  const [nodeRange, setNodeRange] = useState<number>(150);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [updatingNodeId, setUpdatingNodeId] = useState<string | null>(null);

  // Form notifications for adding nodes
  const [addNodeSuccess, setAddNodeSuccess] = useState<string | null>(null);
  const [addNodeError, setAddNodeError] = useState<string | null>(null);

  // Map & Dijkstra Router states
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [userLat, setUserLat] = useState<number>(10.0735);
  const [userLng, setUserLng] = useState<number>(-69.3250);
  const [dijkstraSource, setDijkstraSource] = useState<string>('');
  const [dijkstraDest, setDijkstraDest] = useState<string>('');
  const [calculatedRoute, setCalculatedRoute] = useState<any | null>(null);
  const [dijkstraError, setDijkstraError] = useState<string | null>(null);

  // Google Sheets state
  const [sheetsUser, setSheetsUser] = useState<any | null>(null);
  const [sheetsToken, setSheetsToken] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string>(localStorage.getItem('redsos_spreadsheet_id') || '');
  const [isExportingSheets, setIsExportingSheets] = useState<boolean>(false);
  const [sheetsStatus, setSheetsStatus] = useState<string>('');
  const [sheetsSuccess, setSheetsSuccess] = useState<boolean | null>(null);
  const [sheetsError, setSheetsError] = useState<string | null>(null);

  // Google Chat state complying strictly with Prompt 2
  const [webhookUrl, setWebhookUrl] = useState<string>(() =>
    localStorage.getItem('redsos_webhook_url') ?? ''
  );
  const [cbStatus, setCbStatus] = useState<{
    state: 'OPEN' | 'CLOSED';
    requestCount: number;
    nextResetIn: number;
    suppressedCount?: number;
  } | null>(null);
  const [chatStatus, setChatStatus] = useState<string>('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [isTestingChat, setIsTestingChat] = useState<boolean>(false);

  // Auto-refresh states (Prompt 1)
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(10); // segundos

  // Packet loss history state (Prompt 2)
  const [packetLossHistory, setPacketLossHistory] = useState<{ time: string; loss: number }[]>([]);

  // Latency / Ping states (Prompt 3)
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [pingStatus, setPingStatus] = useState<'ok' | 'slow' | 'offline'>('ok');

  // Mesh layers real-time status (Estado de la Red Mesh por Capas)
  const [meshLayerStatus, setMeshLayerStatus] = useState<MeshLayerStatus | null>(null);

  // Update circuit metrics periodically from getCircuitBreakerStatus
  useEffect(() => {
    const updateCB = () => {
      const status = getCircuitBreakerStatus();
      setCbStatus({
        state: status.state,
        requestCount: status.requestCount,
        nextResetIn: status.nextResetIn,
        suppressedCount: status.suppressedCount,
      });
    };
    updateCB();
    const interval = setInterval(updateCB, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveWebhook = () => {
    localStorage.setItem('redsos_webhook_url', webhookUrl);
    setChatStatus("Enlace guardado de forma segura en almacenamiento persistente.");
    setTimeout(() => setChatStatus(''), 4000);
  };

  const handleTestChatNotification = async () => {
    if (!webhookUrl.trim()) {
      setChatError("Por favor, ingrese un Webhook URL válido.");
      return;
    }
    
    setIsTestingChat(true);
    setChatError(null);
    setChatStatus("Enviando tarjeta de prueba crítica a Google Chat...");

    try {
      localStorage.setItem('redsos_webhook_url', webhookUrl);
      const res = await sendCriticalAlert({
        id: `TEST-${Math.floor(Math.random() * 9000 + 1000)}`,
        nodeId: "Simulador de Pruebas IAGAMI",
        lat: 10.0735,
        lng: -69.3250,
        batteryLevel: 87,
        description: "PRUEBA DE INTEGRACIÓN: Webhook disparado desde la Base de Mando Administrativa.",
        priority: "CRITICAL",
        timestamp: new Date().toISOString()
      }, webhookUrl);

      if (res.sent) {
        setChatStatus("¡Éxito! Tarjeta Rich Card enviada al canal de Google Chat.");
      } else {
        if (res.reason === 'CIRCUIT_OPEN' || res.reason === 'CIRCUIT_TRIPPED_TO_OPEN') {
          throw new Error("El Circuit Breaker está ABIERTO debido a saturación de llamadas. Bloqueando envío por 30s.");
        } else {
          throw new Error(`El webhook de Google Chat rechazó la solicitud o el formato es incorrecto: ${res.reason}`);
        }
      }
    } catch (err: any) {
      setChatError(err.message || "Error al conectar con la API.");
      setChatStatus("");
    } finally {
      setIsTestingChat(false);
      // Force refresh status
      const status = getCircuitBreakerStatus();
      setCbStatus({
        state: status.state,
        requestCount: status.requestCount,
        nextResetIn: status.nextResetIn,
        suppressedCount: status.suppressedCount,
      });
    }
  };

  const handleResetCircuit = () => {
    resetCircuitBreaker();
    const status = getCircuitBreakerStatus();
    setCbStatus({
      state: status.state,
      requestCount: status.requestCount,
      nextResetIn: status.nextResetIn,
      suppressedCount: status.suppressedCount,
    });
    setChatStatus("Circuit Breaker rearmado con éxito.");
    setTimeout(() => setChatStatus(''), 4000);
  };

  // Initialize Google Auth state listener when admin is logged in
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const unsubscribe = initAuth(
      (user, token) => {
        setSheetsUser(user);
        setSheetsToken(token);
        setSheetsError(null);
      },
      () => {
        setSheetsUser(null);
        setSheetsToken(null);
      }
    );
    return () => unsubscribe();
  }, [isAuthenticated]);

  const handleGoogleSignIn = async () => {
    setSheetsError(null);
    setSheetsStatus("Conectando con Google...");
    try {
      const res = await googleSignIn();
      if (res) {
        setSheetsUser(res.user);
        setSheetsToken(res.accessToken);
        setSheetsStatus("Autenticado con éxito");
      }
    } catch (err: any) {
      console.error("Error de login en Sheets:", err);
      setSheetsError(`Fallo al autenticar: ${err.message || err}`);
      setSheetsStatus("");
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await logout();
      setSheetsUser(null);
      setSheetsToken(null);
      setSheetsStatus("Sesión de Google cerrada");
    } catch (err: any) {
      console.error(err);
    }
  };

  const exportToGoogleSheets = async () => {
    if (!sheetsToken) {
      setSheetsError("Inicie sesión con su cuenta de Google institucional.");
      return;
    }

    // Check internet connection
    if (navigator.onLine === false) {
      setSheetsError("Sin conexión a Internet. La exportación de auditoría requiere señal activa.");
      return;
    }

    setIsExportingSheets(true);
    setSheetsStatus("Validando hoja de cálculo...");
    setSheetsError(null);
    setSheetsSuccess(null);

    try {
      let currentSpreadsheetId = spreadsheetId.trim();

      // If no spreadsheet ID exists, create a new one automatically
      if (!currentSpreadsheetId) {
        setSheetsStatus("Creando nueva hoja de cálculo 'RedSOS Emergency Audit Log'...");
        const newId = await createRedSOSSpreadsheet(sheetsToken, `RedSOS Registro de Emergencias - ${new Date().toLocaleDateString()}`);
        currentSpreadsheetId = newId;
        setSpreadsheetId(newId);
        localStorage.setItem('redsos_spreadsheet_id', newId);
      }

      // Prepare data collection from Firestore alerts
      setSheetsStatus("Extrayendo datos de alertas...");
      const alertsToExport = healthData?.emergencyAlerts || [];
      if (alertsToExport.length === 0) {
        throw new Error("No hay registros de alerta SOS en cola de datos.");
      }

      // Map to correct format: 'Timestamp', 'MessageID', 'Latitud', 'Longitud', 'Batería_Nodo' y 'Estado'
      // Pack the rows with batch optimization to avoid API congestion
      setSheetsStatus(`Escribiendo lote de ${alertsToExport.length} alertas en bloque...`);
      const formattedRows: SheetsAlertRow[] = alertsToExport.map((alert: any) => ({
        timestamp: new Date(alert.created_at).toISOString(),
        messageId: alert.id || "N/A",
        latitude: alert.latitude,
        longitude: alert.longitude,
        batteryLevel: alert.battery_level || 100,
        status: alert.status || "active",
      }));

      // Push to sheets
      await appendAlertsToSheet(sheetsToken, currentSpreadsheetId, formattedRows);

      setSheetsSuccess(true);
      setSheetsStatus(`Sincronización finalizada. ${alertsToExport.length} alertas registradas con éxito.`);
    } catch (err: any) {
      console.error("Sheets export error:", err);
      setSheetsError(err.message || "Error al escribir a la API de Google Sheets.");
      setSheetsSuccess(false);
    } finally {
      setIsExportingSheets(false);
    }
  };


  // Check storage on mount
  useEffect(() => {
    // Por seguridad, ya no almacenamos el token en texto plano en sessionStorage.
    // El usuario de la Base de Mando debe autenticarse al refrescar la página.
  }, []);

  // 2. useEffect que activa/desactiva el polling (Prompt 1)
  useEffect(() => {
    if (!autoRefresh || !isAuthenticated || !adminToken) return;
    const id = setInterval(() => fetchAdminData(adminToken), refreshInterval * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshInterval, isAuthenticated, adminToken]);

  // 2. Función de ping (Prompt 3)
  const measurePing = async () => {
    const start = performance.now();
    try {
      await fetch(`${API_URL}/api/health`, { cache: 'no-store' });
      const ms = Math.round(performance.now() - start);
      setPingMs(ms);
      setPingStatus(ms < 100 ? 'ok' : ms < 300 ? 'slow' : 'offline');
    } catch {
      setPingMs(null);
      setPingStatus('offline');
    }
  };

  // 3. Ejecutar cada 15 segundos cuando autenticado (Prompt 3)
  useEffect(() => {
    if (!isAuthenticated) return;
    measurePing();
    const id = setInterval(measurePing, 15000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // Monitor de Capas de Red Mesh por Capas
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    startMeshMonitor((status) => {
      if (active) {
        setMeshLayerStatus(status);
      }
    });
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputToken.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Test the token against backend system-health
      const res = await fetch(`${API_URL}/api/admin/system-health`, {
        headers: {
          'x-admin-token': inputToken.trim()
        }
      });

      if (res.ok) {
        const tokenHash = await hashAdminToken(inputToken.trim());
        sessionStorage.setItem('redsos_admin_token_hash', tokenHash);
        setAdminToken(inputToken.trim());
        setIsAuthenticated(true);
        const data = await res.json();
        setHealthData(data);
        if (data?.packetLoss) {
          setPacketLossHistory(prev => [
            ...prev.slice(-20),
            {
              time: new Date().toLocaleTimeString(),
              loss: data.packetLoss.averageLoss
            }
          ]);
        }
        setNodeRange(data.globalNodeRange || 150);
        // Also fetch audited chats and current nodes
        await Promise.all([
          fetchAuditedChats(inputToken.trim()),
          fetchNodes()
        ]);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Token de acceso de administrador inválido');
      }
    } catch (err) {
      setError('Error al intentar autenticar con la Base de Mando.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('redsos_admin_token_hash');
    setAdminToken('');
    setIsAuthenticated(false);
    setHealthData(null);
    setAuditedMsgs([]);
    setAutoRefresh(false);
    setPacketLossHistory([]);
    setPingMs(null);
    setPingStatus('offline');
  };

  const fetchAdminData = async (token: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/system-health`, {
        headers: { 'x-admin-token': token }
      });
      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
        if (data?.packetLoss) {
          setPacketLossHistory(prev => [
            ...prev.slice(-20),
            {
              time: new Date().toLocaleTimeString(),
              loss: data.packetLoss.averageLoss
            }
          ]);
        }
        setNodeRange(data.globalNodeRange || 150);
        await Promise.all([
          fetchAuditedChats(token),
          fetchNodes()
        ]);
      } else {
        handleLogout();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminDataQuietly = async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/system-health`, {
        headers: { 'x-admin-token': token }
      });
      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
        if (data?.packetLoss) {
          setPacketLossHistory(prev => [
            ...prev.slice(-20),
            {
              time: new Date().toLocaleTimeString(),
              loss: data.packetLoss.averageLoss
            }
          ]);
        }
        await Promise.all([
          fetchAuditedChats(token),
          fetchNodes()
        ]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateAlertStatus = async (alertId: string, newStatus: string) => {
    try {
      const res = await fetch(`${API_URL}/api/alerts/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: alertId, status: newStatus })
      });
      if (res.ok) {
        fetchAdminDataQuietly(adminToken);
      }
    } catch (err) {
      console.error("Error updating alert status:", err);
    }
  };

  const handleCalculateRoute = async () => {
    if (!dijkstraSource || !dijkstraDest) return;
    setDijkstraError(null);
    setCalculatedRoute(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/dijkstra-route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({ sourceId: dijkstraSource, destId: dijkstraDest })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCalculatedRoute(data.route);
      } else {
        setDijkstraError(data.error || "No se pudo calcular una ruta física viable.");
      }
    } catch (err) {
      setDijkstraError("Error al conectar con el servidor de enrutamiento.");
    }
  };

  const fetchAuditedChats = async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/audit-chat`, {
        headers: { 'x-admin-token': token }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditedMsgs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchNodes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/nodes`);
      if (res.ok) {
        const data = await res.json();
        setNodes(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRangeChange = async (newRange: number) => {
    setNodeRange(newRange);
    try {
      const res = await fetch(`${API_URL}/api/admin/set-node-range`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({ range: newRange })
      });
      if (res.ok) {
        // refresh stats
        fetchAdminData(adminToken);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleNode = async (nodeId: string) => {
    setUpdatingNodeId(nodeId);
    try {
      const res = await fetch(`${API_URL}/api/admin/toggle-node-outage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({ id: nodeId })
      });
      if (res.ok) {
        await Promise.all([
          fetchAdminData(adminToken),
          fetchNodes()
        ]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingNodeId(null);
    }
  };

  // Filtered audited messages
  const filteredAuditedMsgs = auditedMsgs.filter(m => 
    m.sender_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.hash_sha256.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] p-4 bg-slate-950/40">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-slate-900 border border-red-500/30 rounded-2xl p-6 shadow-[0_0_35px_rgba(239,68,68,0.15)] backdrop-blur-md"
        >
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center text-red-500 mb-4 animate-pulse">
              <Shield className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-wide font-display">CENTRO DE MANDO ESTRATÉGICO</h2>
            <p className="text-xs text-red-400 mt-1 uppercase tracking-widest font-mono font-bold">Nivel de Acceso: Gobierno</p>
            <p className="text-xs text-slate-400 mt-2 text-center">
              Ingrese la llave de seguridad administrativa para desbloquear la telemetría militar y el control de redundancia mesh.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-300 font-mono uppercase mb-2">Llave de Acceso Secreta</label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="•••••••••••••••••••••"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono placeholder-slate-700 focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/30 transition-all text-sm"
                />
                <Lock className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs font-medium flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-xl text-sm transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center gap-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Autenticar Acceso Directo</span>
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Status */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-center text-red-500">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold text-white tracking-tight font-display">BASE DE MANDO ESTRATÉGICA</h1>
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[10px] uppercase font-mono font-bold tracking-wider">
                Gobierno de Crisis
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Monitoreo y simulación de la Red Mesh en tiempo real. Encriptación militar habilitada.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* Latency / Ping status indicator (Prompt 3) */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg shrink-0" style={{ maxWidth: '90px' }}>
            {pingStatus === 'ok' && (
              <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{pingMs}ms</span>
              </span>
            )}
            {pingStatus === 'slow' && (
              <span className="text-yellow-400 font-mono text-[11px] flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                <span>{pingMs}ms</span>
              </span>
            )}
            {pingStatus === 'offline' && (
              <span className="text-red-400 font-mono text-[11px] flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span>Sin señal</span>
              </span>
            )}
          </div>

          {/* Auto Refresh Configuration (Prompt 1) */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 shrink-0">
            <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setAutoRefresh(!autoRefresh)}>
              <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${autoRefresh ? 'bg-emerald-500' : 'bg-slate-800'}`}>
                <div className={`w-3 h-3 rounded-full bg-white transition-transform ${autoRefresh ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-[11px] text-slate-300 font-medium">Monitoreo Activo</span>
            </div>

            {autoRefresh && (
              <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2">
                <span className="text-emerald-400 font-mono text-[10px] animate-pulse flex items-center gap-1 font-bold">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 animate-ping" />
                  ● EN VIVO
                </span>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-[10px] text-slate-300 font-mono focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                >
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                  <option value={30}>30s</option>
                </select>
              </div>
            )}
          </div>

          <button
            onClick={() => fetchAdminData(adminToken)}
            className="p-2 bg-slate-950 border border-slate-800 rounded-lg hover:bg-slate-800 text-slate-300 transition-all cursor-pointer"
            title="Sincronizar telemetría"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-slate-950 hover:bg-red-950/30 border border-slate-800 hover:border-red-500/30 text-xs text-slate-400 hover:text-red-400 font-medium font-mono rounded-lg transition-all cursor-pointer"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: System Health */}
        <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono uppercase">Salud de Red</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                {healthData?.networkHealth.percentage}%
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-mono uppercase">
                  {healthData?.networkHealth.activeNodes}/{healthData?.networkHealth.totalNodes} Nodos ({healthData?.networkHealth.status})
                </span>
              </div>
            </div>
            <Sparkline data={[85, 88, 92, 90, 95, healthData?.networkHealth.percentage || 100]} color="#10b981" />
          </div>
        </div>

        {/* Metric 2: Active SOS */}
        <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono uppercase">Alertas SOS</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-2xl md:text-3xl font-bold text-red-500 tracking-tight">
                {healthData?.emergencyAlerts.length || 0}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                <span className="text-[10px] text-red-400 font-mono uppercase">
                  Alertas Activas en Malla
                </span>
              </div>
            </div>
            <Sparkline data={[1, 3, 2, 4, 3, healthData?.emergencyAlerts.length || 0]} color="#ef4444" />
          </div>
        </div>

        {/* Metric 3: Packet Loss */}
        <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono uppercase">Pérdida de Paquetes</span>
            <TrendingDown className="w-4 h-4 text-yellow-500" />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                {healthData?.packetLoss.averageLoss}%
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                <span className="text-[10px] text-yellow-400 font-mono uppercase">
                  {healthData?.packetLoss.status}
                </span>
              </div>
            </div>
            <Sparkline data={[18, 12, 15, 9, 11, healthData?.packetLoss.averageLoss || 0]} color="#f59e0b" />
          </div>
        </div>

        {/* Metric 4: Battery Metrics */}
        <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono uppercase">Reserva Energética</span>
            <Battery className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                {healthData?.batteryMetrics.average}%
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span className="text-[10px] text-blue-400 font-mono uppercase">
                  {healthData?.batteryMetrics.criticalCount} Nodos bajo de 30%
                </span>
              </div>
            </div>
            <Sparkline data={[85, 83, 82, 80, 81, healthData?.batteryMetrics.average || 0]} color="#3b82f6" />
          </div>
        </div>
      </div>

      {/* Main Grid: Control & Simulators + Maps */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Parameters and Node Fallback list */}
        <div className="lg:col-span-4 space-y-6">
          {/* Estado de la Red Mesh por Capas */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-white font-medium border-b border-slate-800 pb-2">
              <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
              <span className="text-sm font-semibold tracking-wide">Estado de la Red Mesh por Capas</span>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              Monitoreo activo de capas redundantes en Barquisimeto, Venezuela. El orquestador selecciona dinámicamente el canal de radio óptimo.
            </p>

            <div className="space-y-3">
              {/* Capa 1: Internet */}
              <div className={`p-2.5 rounded-lg border ${meshLayerStatus?.internet ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-slate-950 border-slate-800'} flex justify-between items-center`}>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-200">Capa 1: WAN Internet (Cloudflare Worker)</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {meshLayerStatus?.internet ? `Latencia: ${pingMs || '--'}ms` : 'Sin conexión satelital/celular'}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                  meshLayerStatus?.internet ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse'
                }`}>
                  {meshLayerStatus?.internet ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>

              {/* Capa 2: LoRa Meshtastic - sin integración de hardware real todavía */}
              <div className="p-2.5 rounded-lg border bg-slate-950 border-slate-800 flex justify-between items-center opacity-60">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-200">Capa 2: LoRa Meshtastic (Canal IAGAMI)</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Pendiente de integración de hardware físico (radios LoRa/Meshtastic)
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
                  NO DISPONIBLE
                </span>
              </div>

              {/* Capa 3: Native BLE */}
              <div className={`p-2.5 rounded-lg border ${meshLayerStatus?.nativeBLE.available ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-slate-950 border-slate-800'} flex justify-between items-center`}>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-200">Capa 3: BLE Nativo (Brigadas de Rescate)</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {meshLayerStatus?.nativeBLE.available
                      ? 'Advertising activo (sin confirmación de recepción — BLE no tiene ACK)'
                      : 'No disponible en este navegador/plataforma'}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                  meshLayerStatus?.nativeBLE.available ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {meshLayerStatus?.nativeBLE.available ? 'DISPONIBLE' : 'NO DISPONIBLE'}
                </span>
              </div>

              {/* Capa 4: Web Bluetooth */}
              <div className={`p-2.5 rounded-lg border ${meshLayerStatus?.webBluetooth.available ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-slate-950 border-slate-800'} flex justify-between items-center`}>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-200">Capa 4: Web Bluetooth PWA (Civiles Chrome)</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {meshLayerStatus?.webBluetooth.peersConnected 
                      ? `${meshLayerStatus.webBluetooth.peersConnected} pares civiles propagando alertas` 
                      : 'Escáner inactivo'}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                  meshLayerStatus?.webBluetooth.available ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse' : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {meshLayerStatus?.webBluetooth.available ? 'ESCANEANDO' : 'INACTIVO'}
                </span>
              </div>

              {/* Cached Packets and Sync */}
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex justify-between items-center font-mono text-[10px] text-slate-400">
                <span>Cola local en espera:</span>
                <span className={`font-bold ${meshLayerStatus?.cachedPackets ? 'text-amber-400' : 'text-slate-500'}`}>
                  {meshLayerStatus?.cachedPackets || 0} paquetes
                </span>
              </div>

              {/* Canal Óptimo Resaltado */}
              <div className="p-3 bg-slate-950 border border-emerald-500/30 rounded-lg flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">Canal Óptimo Seleccionado</span>
                <div className="text-emerald-400 font-display font-black text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                  {meshLayerStatus?.optimalChannel || 'CALCULANDO...'}
                </div>
              </div>
            </div>
          </div>

          {/* Slider Cover Parameter */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-white font-medium border-b border-slate-800 pb-2">
              <Sliders className="w-4 h-4 text-red-500" />
              <span className="text-sm font-semibold tracking-wide">Alcance de Cobertura Mesh</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Modifique de forma dinámica el rango teórico de cada nodo para predecir vacíos en la topología de la malla inalámbrica.
            </p>
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center text-xs text-slate-300 font-mono">
                <span>RANGO ESTÁNDAR:</span>
                <span className="text-red-400 font-bold">{nodeRange} metros</span>
              </div>
              <input
                type="range"
                min="50"
                max="500"
                step="25"
                value={nodeRange}
                onChange={(e) => handleRangeChange(Number(e.target.value))}
                className="w-full accent-red-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>50m (Bajo)</span>
                <span>250m</span>
                <span>500m (Crítico)</span>
              </div>
            </div>
          </div>

          {/* Formulario para agregar nodos reales */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-white font-medium">
                <Shield className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-semibold tracking-wide">Agregar Nodo de Cobertura Barquisimeto</span>
              </div>
              <span className="px-1.5 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded text-[9px] font-mono">
                Director DPCAA
              </span>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setAddNodeSuccess(null);
              setAddNodeError(null);
              const form = e.currentTarget;
              const formData = new FormData(form);
              const payload = {
                id: 'Node_' + Math.floor(1000 + Math.random() * 9000),
                name: formData.get('name') as string,
                lat: parseFloat(formData.get('lat') as string),
                lng: parseFloat(formData.get('lng') as string),
                role: formData.get('role') as string,
                battery: parseInt(formData.get('battery') as string || '100', 10),
                isOnline: true
              };

              if (!payload.name || isNaN(payload.lat) || isNaN(payload.lng)) {
                setAddNodeError('Por favor complete todos los campos requeridos correctamente.');
                return;
              }

              try {
                const res = await fetch(`${API_URL}/api/nodes`, {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                  },
                  body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                  // Refrescar lista de nodos
                  const resNodes = await fetch(`${API_URL}/api/nodes`);
                  const dataNodes = await resNodes.json();
                  setNodes(dataNodes);
                  form.reset();
                  setAddNodeSuccess('¡Nodo agregado con éxito!');
                } else {
                  setAddNodeError(`Error al registrar el nodo en el servidor: ${data.error || 'Desconocido'}`);
                }
              } catch (err) {
                console.error(err);
                setAddNodeError('No se pudo conectar al servidor para registrar el nodo.');
              }
            }} className="space-y-3">
              {addNodeSuccess && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs rounded-lg font-mono">
                  {addNodeSuccess}
                </div>
              )}
              {addNodeError && (
                <div className="p-3 bg-red-950/40 border border-red-800/50 text-red-300 text-xs rounded-lg font-mono">
                  {addNodeError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-semibold uppercase">Nombre del Nodo *</label>
                  <input name="name" type="text" placeholder="Ej: Repetidor El Obelisco" className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none" required />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-semibold uppercase">Rol de Red *</label>
                  <select name="role" className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-emerald-500 focus:outline-none">
                    <option value="gateway">Gateway (Salida Internet)</option>
                    <option value="repeater">Repetidor (Malla)</option>
                    <option value="brigadist">Brigadista Tactico</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-semibold uppercase">Latitud GPS *</label>
                  <input name="lat" type="number" step="any" placeholder="Ej: 10.0706" className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none" required />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-semibold uppercase">Longitud GPS *</label>
                  <input name="lng" type="number" step="any" placeholder="Ej: -69.3195" className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none" required />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-semibold uppercase">Batería (%)</label>
                  <input name="battery" type="number" min="0" max="100" placeholder="100" className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none" />
                </div>
              </div>
              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2.5 rounded text-xs uppercase tracking-wider transition-all cursor-pointer active:scale-[0.98]">
                Registrar Nodo en Producción
              </button>
            </form>
          </div>

          {/* Outage Sim Grid */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-white font-medium">
                <WifiOff className="w-4 h-4 text-red-500" />
                <span className="text-sm font-semibold tracking-wide">Fallas de Enlace / Simulación</span>
              </div>
              <span className="px-1.5 py-0.5 bg-red-950 border border-red-800 text-red-400 rounded text-[9px] font-mono">
                Simulador
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Haga clic sobre un nodo para forzar una desconexión y comprobar cómo la red redirige la señal mediante saltos (hops) a repetidores sanos.
            </p>
            <div className="space-y-2 pt-1 max-h-60 overflow-y-auto">
              {nodes.map((node) => (
                <div 
                  key={node.id}
                  className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${node.isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`} />
                    <div>
                      <div className="text-xs font-semibold text-white">{node.name}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="font-mono bg-slate-900 px-1 py-0.5 rounded text-slate-300">{node.role}</span>
                        <span>{node.battery}% Batería</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleNode(node.id)}
                    disabled={updatingNodeId !== null}
                    className={`px-2 py-1 font-mono text-[9px] font-semibold rounded transition-all ${
                      node.isOnline 
                        ? 'bg-red-950 hover:bg-red-900 text-red-400 border border-red-800' 
                        : 'bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800'
                    }`}
                  >
                    {updatingNodeId === node.id ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : node.isOnline ? (
                      'FORZAR APAGO'
                    ) : (
                      'RECONECTAR'
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Dijkstra Router Cover Parameter */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-white font-medium border-b border-slate-800 pb-2">
              <Compass className="w-4 h-4 text-red-500" />
              <span className="text-sm font-semibold tracking-wide">Calculador de Enrutamiento Dijkstra</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Calcule el camino de saltos óptimo entre dos puntos físicos de la red mesh, considerando atenuación de señal y niveles de batería.
            </p>
            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="block text-[10px] text-slate-400 font-mono uppercase">Nodo Origen</label>
                <select
                  value={dijkstraSource}
                  onChange={(e) => setDijkstraSource(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 p-2 focus:outline-none focus:border-red-500/50"
                >
                  <option value="">Seleccionar nodo...</option>
                  {nodes.map(n => (
                    <option key={`src-${n.id}`} value={n.id} disabled={!n.isOnline}>{n.name} {!n.isOnline ? '(OFFLINE)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] text-slate-400 font-mono uppercase">Nodo Destino</label>
                <select
                  value={dijkstraDest}
                  onChange={(e) => setDijkstraDest(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 p-2 focus:outline-none focus:border-red-500/50"
                >
                  <option value="">Seleccionar nodo...</option>
                  {nodes.map(n => (
                    <option key={`dest-${n.id}`} value={n.id} disabled={!n.isOnline}>{n.name} {!n.isOnline ? '(OFFLINE)' : ''}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleCalculateRoute}
                disabled={!dijkstraSource || !dijkstraDest}
                className="w-full py-2 bg-slate-950 hover:bg-red-950/20 text-slate-300 hover:text-red-400 border border-slate-800 hover:border-red-500/30 rounded-lg text-xs font-mono transition-all font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-slate-950 disabled:hover:text-slate-300"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Calcular Ruta Óptima
              </button>

              {dijkstraError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] rounded">
                  {dijkstraError}
                </div>
              )}

              {calculatedRoute && (
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>SALTOS (HOPS): <strong className="text-white">{calculatedRoute.hops}</strong></span>
                    <span>DISTANCIA: <strong className="text-white">{calculatedRoute.totalDistance}m</strong></span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">Cruce de Saltos:</span>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300 font-mono">
                      {calculatedRoute.path.map((step: string, i: number) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-red-500">→</span>}
                          <span className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-white">{step}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Módulo de Auditoría y Reportes (Google Sheets) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-white font-medium border-b border-slate-800 pb-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold tracking-wide">Auditoría / Exportación Sheets</span>
            </div>

            {/* Offline Banner indicator */}
            {!navigator.onLine && (
              <div className="p-2.5 bg-amber-950/40 border border-amber-900/60 text-amber-400 text-xs rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 animate-bounce shrink-0" />
                <span className="font-semibold">Exportación pendiente - Sin conexión</span>
              </div>
            )}

            <p className="text-xs text-slate-400 leading-relaxed">
              Exporte y registre de manera segura la bitácora activa de emergencias <strong className="text-white">/alerts</strong> a una hoja de cálculo o descargue copias locales de seguridad.
            </p>

            <div className="space-y-3">
              {/* Button: Conectar Google Drive - deshabilitado, requiere Client ID real de Google Cloud Console */}
              <button
                disabled
                title="Función en desarrollo, requiere configuración"
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-slate-100 text-slate-400 font-medium text-xs rounded-lg border border-slate-300 shadow-none cursor-not-allowed opacity-70"
              >
                <svg className="w-4 h-4 shrink-0 grayscale opacity-60" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Conectar Google Drive</span>
              </button>
              <p className="text-[10px] text-amber-500 font-semibold text-center">⚠️ Función en desarrollo, requiere configuración (Client ID de Google Cloud Console pendiente).</p>

              {/* Input for spreadsheet ID saved in localStorage */}
              <div className="space-y-1.5">
                <label className="block text-[10px] text-slate-400 font-mono uppercase">ID de Hoja de Cálculo Destino</label>
                <input
                  type="text"
                  placeholder="ID guardado en localStorage..."
                  value={spreadsheetId}
                  onChange={(e) => {
                    setSpreadsheetId(e.target.value);
                    localStorage.setItem('redsos_spreadsheet_id', e.target.value);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 p-2 font-mono placeholder-slate-700 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {/* Button: Exportar Alertas a Sheets */}
              <button
                onClick={async () => {
                  if (!navigator.onLine) {
                    setSheetsError("No se puede exportar: dispositivo sin conexión de red.");
                    return;
                  }
                  try {
                    setSheetsStatus("Sincronizando con base de alertas...");
                    const res = await fetch(`${API_URL}/api/alerts`);
                    if (!res.ok) throw new Error("Fallo al obtener alertas");
                    const data = await res.json();
                    
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const blobUrl = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    link.download = `redsos_alerts_${Date.now()}.json`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(blobUrl);

                    setSheetsStatus("✓ Backup de alertas exportado con éxito.");
                    setSheetsError(null);
                  } catch (err: any) {
                    setSheetsError(err.message || "Error al descargar alertas.");
                  }
                }}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar Alertas a Sheets</span>
              </button>
            </div>

            {sheetsStatus && (
              <div className="p-2.5 bg-emerald-950/30 border border-emerald-900/40 text-emerald-400 text-[10px] rounded flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{sheetsStatus}</span>
              </div>
            )}

            {sheetsError && (
              <div className="p-2.5 bg-red-950/30 border border-red-900/40 text-red-400 text-[10px] rounded flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{sheetsError}</span>
              </div>
            )}
          </div>

          {/* Módulo de Integración con Google Chat (Notificaciones Críticas) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-white font-medium border-b border-slate-800 pb-2">
              <MessageSquare className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-semibold tracking-wide">Notificaciones Google Chat</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Envíe de manera automática alertas críticas formatadas en <strong className="text-white">Card Format V2</strong> a un espacio de Google Chat mediante Webhook.
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] text-slate-400 font-mono uppercase">URL de Webhook Google Chat</label>
                <input
                  type="text"
                  placeholder="https://chat.googleapis.com/v1/spaces/..."
                  value={webhookUrl}
                  onChange={(e) => {
                    setWebhookUrl(e.target.value);
                    localStorage.setItem('redsos_webhook_url', e.target.value);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 p-2 font-mono placeholder-slate-700 focus:outline-none focus:border-sky-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSaveWebhook}
                  className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-all cursor-pointer text-center"
                >
                  Guardar Enlace
                </button>
                <button
                  onClick={handleTestChatNotification}
                  disabled={isTestingChat}
                  className="py-1.5 px-3 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-850 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-sky-950/20"
                >
                  {isTestingChat ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Probando...</span>
                    </>
                  ) : (
                    <span>Probar Notificación</span>
                  )}
                </button>
              </div>
            </div>

            {/* Circuit Breaker Status indicator */}
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-850 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-mono uppercase">DevOps Circuit Breaker</span>
                <span className={`flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-full ${
                  cbStatus?.state === 'CLOSED'
                    ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/60'
                    : 'bg-red-950/40 text-red-400 border border-red-900/60 animate-pulse'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    cbStatus?.state === 'CLOSED' ? 'bg-emerald-500' : 'bg-red-500 animate-ping'
                  }`} />
                  {cbStatus?.state === 'CLOSED' ? 'CLOSED' : 'OPEN'}
                </span>
              </div>

              <div className="text-[10px] text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>Mensajes en ventana (Max 3):</span>
                  <span>{cbStatus?.requestCount || 0} / 3</span>
                </div>
                {cbStatus?.state === 'OPEN' && (
                  <div className="flex justify-between text-red-400">
                    <span>Reajuste automático en:</span>
                    <span className="font-semibold">{cbStatus?.nextResetIn || 0}s</span>
                  </div>
                )}
                {cbStatus?.suppressedCount ? cbStatus.suppressedCount > 0 && (
                  <div className="flex justify-between text-amber-500 font-semibold">
                    <span>Alertas suprimidas:</span>
                    <span>{cbStatus.suppressedCount}</span>
                  </div>
                ) : null}
              </div>

              {cbStatus?.state === 'OPEN' && (
                <button
                  onClick={handleResetCircuit}
                  className="w-full mt-2 py-1 bg-red-950/50 hover:bg-red-900/40 text-red-400 border border-red-900/40 hover:border-red-800 rounded text-[9px] font-mono transition-all cursor-pointer"
                >
                  Rearmar Fusible (Reset)
                </button>
              )}
            </div>

            {chatStatus && (
              <div className="p-2.5 bg-sky-950/30 border border-sky-900/40 text-sky-400 text-[10px] rounded flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{chatStatus}</span>
              </div>
            )}

            {chatError && (
              <div className="p-2.5 bg-red-950/30 border border-red-900/40 text-red-400 text-[10px] rounded flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{chatError}</span>
              </div>
            )}
          </div>
        </div>


        {/* Right Side: Heatmap/Audit logs */}
        <div className="lg:col-span-8 space-y-6">
          {/* Tactical Map Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-white font-medium border-b border-slate-800 pb-2">
              <Compass className="w-4 h-4 text-red-500 animate-pulse" />
              <span className="text-sm font-semibold tracking-wide">Mapa Táctico y Cobertura de Señal (Barquisimeto)</span>
            </div>
            <NetworkMap 
              nodes={nodes} 
              alerts={healthData?.emergencyAlerts || []} 
              userLat={userLat} 
              userLng={userLng} 
              onUpdateUserCoords={(lat, lng) => {
                setUserLat(lat);
                setUserLng(lng);
              }} 
              selectedNodeId={selectedNodeId} 
              onSelectNode={setSelectedNodeId} 
              isDesastreMode={true} 
            />
          </div>

          {/* Panel de Despacho y Gestión de Emergencias SOS */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-white font-medium">
                <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
                <span className="text-sm font-semibold tracking-wide">Centro de Despacho y Gestión de Emergencias SOS</span>
              </div>
              <span className="px-2 py-0.5 bg-red-950/40 border border-red-800 text-red-400 rounded text-[9px] font-mono uppercase tracking-wide font-bold">
                Control de Emergencias
              </span>
            </div>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {healthData?.emergencyAlerts.map((alert) => (
                <div key={alert.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{alert.user_name}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
                        alert.status === 'active' ? 'bg-red-950 text-red-400 border border-red-800 animate-pulse' :
                        alert.status === 'attending' ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                        'bg-emerald-950 text-emerald-400 border border-emerald-900'
                      }`}>
                        {alert.status === 'active' ? 'CRÍTICO' : alert.status === 'attending' ? 'ATENDIENDO' : 'RESUELTA'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      GPS: {alert.latitude.toFixed(5)}, {alert.longitude.toFixed(5)} | {new Date(alert.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    {alert.description}
                  </p>
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-900">
                    {alert.status !== 'attending' && alert.status !== 'resolved' && (
                      <button
                        onClick={() => handleUpdateAlertStatus(alert.id, 'attending')}
                        className="px-2.5 py-1 bg-amber-950 hover:bg-amber-900 text-amber-400 text-[10px] font-semibold rounded border border-amber-800 transition-all"
                      >
                        Atender Alerta
                      </button>
                    )}
                    {alert.status !== 'resolved' && (
                      <button
                        onClick={() => handleUpdateAlertStatus(alert.id, 'resolved')}
                        className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-400 text-[10px] font-semibold rounded border border-emerald-800 transition-all"
                      >
                        Marcar Resuelta
                      </button>
                    )}
                    {alert.status !== 'active' && (
                      <button
                        onClick={() => handleUpdateAlertStatus(alert.id, 'active')}
                        className="px-2.5 py-1 bg-red-950 hover:bg-red-900 text-red-400 text-[10px] font-semibold rounded border border-red-800 transition-all"
                      >
                        Reactivar Alerta
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setUserLat(alert.latitude);
                        setUserLng(alert.longitude);
                        const container = document.getElementById('mesh-svg-map');
                        if (container) container.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="ml-auto px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 text-[10px] font-mono rounded border border-slate-800 transition-all"
                    >
                      Centrar Mapa
                    </button>
                  </div>
                </div>
              ))}
              {(!healthData?.emergencyAlerts || healthData.emergencyAlerts.length === 0) && (
                <div className="py-6 text-center text-slate-500 font-mono text-xs">
                  No hay alertas SOS en cola. Canal de emergencias despejado.
                </div>
              )}
            </div>
          </div>

          {/* Loss and Packets table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-sm font-semibold text-white tracking-wide">Visibilidad de Paquetes Perdidos</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono">
                    <th className="py-2 px-1">Nodo Origen</th>
                    <th className="py-2">Nodo Destino</th>
                    <th className="py-2">Motivo Falla</th>
                    <th className="py-2 text-right">Pérdida</th>
                    <th className="py-2 text-right">Saltos</th>
                    <th className="py-2 text-right">Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {healthData?.failedPackets.map((fp) => (
                    <tr key={fp.id} className="text-slate-200 font-mono hover:bg-slate-950/40">
                      <td className="py-2 px-1 font-sans font-medium text-white">{fp.sourceNode}</td>
                      <td className="py-2 font-sans">{fp.destNode}</td>
                      <td className="py-2 text-red-400">{fp.reason}</td>
                      <td className="py-2 text-right text-red-500 font-bold">{fp.lossPercentage}%</td>
                      <td className="py-2 text-right">{fp.hops}</td>
                      <td className="py-2 text-right text-slate-500 text-[10px]">
                        {new Date(fp.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                  {(!healthData?.failedPackets || healthData.failedPackets.length === 0) && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-500">
                        No hay reportes de colisión o pérdida de paquetes en las últimas 24 horas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Real-time packet loss history line chart (Prompt 2) */}
            <div className="pt-4 border-t border-slate-800/60">
              <span className="text-[10px] text-slate-400 font-mono uppercase block mb-2">Historial de Pérdida en Tiempo Real</span>
              {packetLossHistory.length < 2 ? (
                <div className="flex items-center justify-center h-[180px] bg-slate-950 border border-slate-800 rounded-lg text-slate-500 text-xs font-mono">
                  <span className="animate-pulse">Acumulando datos... ({packetLossHistory.length}/2 puntos necesarios)</span>
                </div>
              ) : (
                <div className="w-full h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={packetLossHistory} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} unit="%" />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="loss"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={false}
                        name="Pérdida %"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Audit Chat logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-red-500" />
                <span className="text-sm font-semibold text-white tracking-wide">Auditoría del Canal y Verificación de Hashes</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar por mensaje / emisor / hash..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-red-500/50 w-full sm:w-64"
                />
                <Search className="absolute left-2.5 top-1.5 w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {filteredAuditedMsgs.map((msg) => (
                <div 
                  key={msg.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2 hover:border-slate-700 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white font-sans">{msg.sender_name}</span>
                      <span className="px-1.5 py-0.5 bg-slate-900 text-[9px] text-slate-400 font-mono rounded">
                        Saltos: {msg.hops} (TTL: {msg.ttl})
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 font-sans italic bg-slate-900/50 p-2 rounded border-l-2 border-red-500/60 leading-relaxed">
                    "{msg.content}"
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 text-[10px] font-mono text-slate-500 border-t border-slate-900">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <span className="text-slate-400">HASH SHA-256:</span>
                      <span className="text-slate-400 truncate hover:text-white transition-colors" title={msg.hash_sha256}>
                        {msg.hash_sha256}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 md:justify-end">
                      <div className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle className="w-3 h-3" />
                        <span>Integridad OK</span>
                      </div>
                      <div className="flex items-center gap-1 text-blue-400">
                        <Eye className="w-3 h-3" />
                        <span>Llave: RSA-GOV</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {filteredAuditedMsgs.length === 0 && (
                <div className="py-8 text-center text-slate-500 font-mono text-xs">
                  No se encontraron mensajes auditados.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
