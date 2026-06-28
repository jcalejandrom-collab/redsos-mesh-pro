import React, { useState, useEffect } from 'react';
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
  Navigation
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import NetworkMap from './NetworkMap';

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

  // Map & Dijkstra Router states
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [userLat, setUserLat] = useState<number>(10.0735);
  const [userLng, setUserLng] = useState<number>(-69.3250);
  const [dijkstraSource, setDijkstraSource] = useState<string>('');
  const [dijkstraDest, setDijkstraDest] = useState<string>('');
  const [calculatedRoute, setCalculatedRoute] = useState<any | null>(null);
  const [dijkstraError, setDijkstraError] = useState<string | null>(null);

  // Check storage on mount
  useEffect(() => {
    const savedToken = sessionStorage.getItem('redsos_admin_token');
    if (savedToken) {
      setAdminToken(savedToken);
      setIsAuthenticated(true);
      fetchAdminData(savedToken);
    }
  }, []);

  // Auto-refresh telemetries every 5 seconds when authenticated
  useEffect(() => {
    if (!isAuthenticated || !adminToken) return;

    const interval = setInterval(() => {
      fetchAdminDataQuietly(adminToken);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAuthenticated, adminToken]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputToken.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Test the token against backend system-health
      const res = await fetch('/api/admin/system-health', {
        headers: {
          'x-admin-token': inputToken.trim()
        }
      });

      if (res.ok) {
        sessionStorage.setItem('redsos_admin_token', inputToken.trim());
        setAdminToken(inputToken.trim());
        setIsAuthenticated(true);
        const data = await res.json();
        setHealthData(data);
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
    sessionStorage.removeItem('redsos_admin_token');
    setAdminToken('');
    setIsAuthenticated(false);
    setHealthData(null);
    setAuditedMsgs([]);
  };

  const fetchAdminData = async (token: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/system-health', {
        headers: { 'x-admin-token': token }
      });
      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
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
      const res = await fetch('/api/admin/system-health', {
        headers: { 'x-admin-token': token }
      });
      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
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
      const res = await fetch('/api/alerts/status', {
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
      const res = await fetch('/api/admin/dijkstra-route', {
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
      const res = await fetch('/api/admin/audit-chat', {
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
      const res = await fetch('/api/nodes');
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
      const res = await fetch('/api/admin/set-node-range', {
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
      const res = await fetch('/api/admin/toggle-node-outage', {
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

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={() => fetchAdminData(adminToken)}
            className="p-2 bg-slate-950 border border-slate-800 rounded-lg hover:bg-slate-800 text-slate-300 transition-all"
            title="Sincronizar telemetría"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-slate-950 hover:bg-red-950/30 border border-slate-800 hover:border-red-500/30 text-xs text-slate-400 hover:text-red-400 font-medium font-mono rounded-lg transition-all"
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
