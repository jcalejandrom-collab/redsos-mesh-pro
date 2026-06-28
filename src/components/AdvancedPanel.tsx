import React, { useState } from 'react';
import { Shield, Key, History, Sliders, ToggleLeft, ToggleRight, Check, Eye, Trash2, Database, Wifi, Server, Cpu, CloudLightning, RefreshCw } from 'lucide-react';

interface AuditLog {
  timestamp: string;
  user: string;
  action: string;
  device: string;
  ip: string;
  signature: string;
}

export default function AdvancedPanel() {
  // Protocol parameters states
  const [blePower, setBlePower] = useState<'high' | 'medium' | 'low'>('high');
  const [seekInterval, setSeekInterval] = useState<number>(30); // seconds
  const [ttlValue, setTtlValue] = useState<number>(5);
  const [enableCompression, setEnableCompression] = useState<boolean>(true);
  const [batteryOptimization, setBatteryOptimization] = useState<boolean>(true);
  const [mfaEnabled, setMfaEnabled] = useState<boolean>(false);
  const [rotaryKeyTime, setRotaryKeyTime] = useState<number>(60); // minutes

  // Active sub-tab inside configuration panel
  const [subTab, setSubTab] = useState<'protocol' | 'security' | 'forensics' | 'firebase-architecture'>('protocol');

  // Forensics logs list state
  const [forensicLogs, setForensicLogs] = useState<AuditLog[]>([
    {
      timestamp: "2026-06-28 08:32:15 UTC",
      user: "Administrador Nacional (ID: #001)",
      action: "Inyección de Firma de Brigada Ed25519 - Clave Pública Clave_A983",
      device: "Admin Panel Web (C4I Server)",
      ip: "189.243.12.87",
      signature: "ed25519_sig_9a87d6f54c3e2b1a..."
    },
    {
      timestamp: "2026-06-28 08:24:41 UTC",
      user: "Brigadista Gael T. (ID: #042)",
      action: "Sincronización de Cola de Mensajería local - 12 mensajes Mesh",
      device: "Pixel 8 Pro (Gateway Uplink)",
      ip: "10.0.12.43",
      signature: "ed25519_sig_5c4b3a2f1e0d9c8b..."
    },
    {
      timestamp: "2026-06-28 08:12:04 UTC",
      user: "Estación Base Central (ID: #002)",
      action: "Cambio de Estado de Alerta #INC-2026-0043 a 'Atendiendo'",
      device: "Base Station Node 4",
      ip: "192.168.100.1",
      signature: "ed25519_sig_0f9e8d7c6b5a4f3e..."
    }
  ]);

  const handleClearForensics = () => {
    setForensicLogs([]);
  };

  return (
    <div id="advanced-config-panel" className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      
      {/* Sub tabs navigation */}
      <div className="lg:col-span-1 bg-slate-900 border border-slate-700/60 p-4 rounded-xl flex flex-col gap-1 shadow-xl h-fit">
        <h3 className="font-display font-semibold text-slate-100 text-sm mb-3 px-2 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-amber-500" />
          Ajustes Avanzados
        </h3>

        <button
          onClick={() => setSubTab('protocol')}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${
            subTab === 'protocol'
              ? 'bg-amber-950/40 text-amber-300 border-amber-800'
              : 'text-slate-400 border-transparent hover:bg-slate-950 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Parámetros de Protocolo
        </button>

        <button
          onClick={() => setSubTab('security')}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${
            subTab === 'security'
              ? 'bg-amber-950/40 text-amber-300 border-amber-800'
              : 'text-slate-400 border-transparent hover:bg-slate-950 hover:text-slate-200'
          }`}
        >
          <Key className="w-4 h-4" />
          Seguridad & Claves
        </button>

        <button
          onClick={() => setSubTab('forensics')}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${
            subTab === 'forensics'
              ? 'bg-amber-950/40 text-amber-300 border-amber-800'
              : 'text-slate-400 border-transparent hover:bg-slate-950 hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          Forense Digital / Auditoría
        </button>

        <button
          onClick={() => setSubTab('firebase-architecture')}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${
            subTab === 'firebase-architecture'
              ? 'bg-amber-950/40 text-amber-300 border-amber-800'
              : 'text-slate-400 border-transparent hover:bg-slate-950 hover:text-slate-200'
          }`}
        >
          <Database className="w-4 h-4 text-emerald-400" />
          Arquitectura Firebase Mesh
        </button>
      </div>

      {/* Settings workspace panel */}
      <div className="lg:col-span-3 bg-slate-900 border border-slate-700/60 p-6 rounded-xl shadow-xl min-h-[460px]">
        
        {/* Protocol config tab content */}
        {subTab === 'protocol' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-100 mb-1">
                Optimización y Canales del Protocolo Mesh
              </h3>
              <p className="text-xs text-slate-400">
                Configure la potencia de emisión y retransmisión para optimizar la batería y el rango de comunicación entre terminales civiles.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* BLE Tx Power */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                <label className="text-xs font-bold text-slate-300 block">Potencia de Emisión Bluetooth (BLE TX Power)</label>
                <p className="text-[10px] text-slate-500">Un valor más alto aumenta el rango pero reduce significativamente la autonomía.</p>
                <div className="flex gap-2 pt-2">
                  {['high', 'medium', 'low'].map(p => (
                    <button
                      key={p}
                      onClick={() => setBlePower(p as any)}
                      className={`flex-1 py-1.5 rounded text-xs uppercase font-mono font-bold border transition-colors ${
                        blePower === p
                          ? 'bg-amber-950 text-amber-300 border-amber-800'
                          : 'bg-slate-900 text-slate-400 border-slate-850 hover:bg-slate-800'
                      }`}
                    >
                      {p === 'high' ? 'Alto (+4 dBm)' : p === 'medium' ? 'Medio (0 dBm)' : 'Bajo (-12 dBm)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Discovery search seek intervals */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                <label className="text-xs font-bold text-slate-300 block">Intervalo de Búsqueda de Vecinos (Segundos)</label>
                <p className="text-[10px] text-slate-500">Frecuencia en la que el transceptor BLE escanea buscando balizas Mesh activas.</p>
                <input
                  type="range"
                  min="5"
                  max="120"
                  value={seekInterval}
                  onChange={(e) => setSeekInterval(Number(e.target.value))}
                  className="w-full mt-3 accent-amber-500"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>5s (Máx Sensibilidad)</span>
                  <span className="text-amber-400 font-bold">{seekInterval}s</span>
                  <span>120s (Ahorro Energía)</span>
                </div>
              </div>

              {/* TTL values limit */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                <label className="text-xs font-bold text-slate-300 block">Límite Máximo de Saltos (TTL del Paquete)</label>
                <p className="text-[10px] text-slate-500">Número máximo de saltos antes de que un paquete expire y se descarte de la red.</p>
                <div className="flex items-center gap-4 pt-2">
                  <input
                    type="number"
                    min="2"
                    max="15"
                    value={ttlValue}
                    onChange={(e) => setTtlValue(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-850 p-2 rounded text-xs font-mono text-slate-200 w-20"
                  />
                  <span className="text-[10px] text-slate-400">Rango óptimo para ciudades: 4 - 8 saltos</span>
                </div>
              </div>

              {/* Binary payload compression toggles */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-slate-300 block">Compresión de Tramas (Gzip Local)</label>
                  <p className="text-[10px] text-slate-500">Reduce el tamaño de tramas para que entren en payload BLE de 31 bytes.</p>
                </div>
                <button
                  onClick={() => setEnableCompression(!enableCompression)}
                  className="text-slate-300 hover:text-white"
                >
                  {enableCompression ? <ToggleRight className="w-10 h-10 text-emerald-500" /> : <ToggleLeft className="w-10 h-10 text-slate-600" />}
                </button>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex justify-between items-center">
              <div>
                <strong className="text-xs text-slate-200 block">Modo Ultra Ahorro de Energía Inteligente</strong>
                <span className="text-[10px] text-slate-400">Reduce el beaconing al 10% si el dispositivo se mantiene estático (sin aceleración).</span>
              </div>
              <button
                onClick={() => setBatteryOptimization(!batteryOptimization)}
                className="text-slate-300 hover:text-white"
              >
                {batteryOptimization ? <ToggleRight className="w-10 h-10 text-emerald-500" /> : <ToggleLeft className="w-10 h-10 text-slate-600" />}
              </button>
            </div>
          </div>
        )}

        {/* Security / Cryptography Settings */}
        {subTab === 'security' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-100 mb-1">
                Criptografía de Extremo a Extremo & Autenticación
              </h3>
              <p className="text-xs text-slate-400">
                Todo tráfico cursado por la red RedSOS se cifra simétricamente en el emisor con algoritmos AES-GCM-256 bits antes de enviarse.
              </p>
            </div>

            <div className="space-y-4">
              
              {/* AES Cryptokey generator details */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Clave de Cifrado del Sector Táctico (AES-256)</span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="password"
                    value="d3s4str3-k3y-s3ct0r-99128374-x"
                    readOnly
                    className="flex-1 bg-slate-900 border border-slate-850 p-2 rounded text-xs font-mono text-slate-400 select-all"
                  />
                  <button className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-4 py-2 rounded flex items-center justify-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Mostrar Clave
                  </button>
                </div>
                <p className="text-[9px] text-slate-500 mt-2">La clave se deriva automáticamente mediante KDF a partir de la firma de autenticación del operador.</p>
              </div>

              {/* MFA Pins */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex items-center justify-between">
                <div>
                  <strong className="text-xs text-slate-200 block">Autenticación Multifactor (MFA PIN)</strong>
                  <span className="text-[10px] text-slate-400">Solicitar clave rotativa de 6 dígitos para autorizar el envío de alertas prioritarias.</span>
                </div>
                <button
                  onClick={() => setMfaEnabled(!mfaEnabled)}
                  className="text-slate-300 hover:text-white"
                >
                  {mfaEnabled ? <ToggleRight className="w-10 h-10 text-emerald-500" /> : <ToggleLeft className="w-10 h-10 text-slate-600" />}
                </button>
              </div>

              {/* Session pins rotation timers */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                <label className="text-xs font-bold text-slate-300 block">Frecuencia de Rotación de Llaves de Sesión (Minutos)</label>
                <p className="text-[10px] text-slate-500">Intervalo de refresco para regenerar las claves efímeras de propagación de chat.</p>
                <div className="flex gap-2">
                  {[15, 30, 60, 120].map(time => (
                    <button
                      key={time}
                      onClick={() => setRotaryKeyTime(time)}
                      className={`flex-1 py-1 px-2 text-xs rounded font-mono ${
                        rotaryKeyTime === time
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-900 text-slate-400 border border-slate-850'
                      }`}
                    >
                      {time} Min
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Forensic logs tab */}
        {subTab === 'forensics' && (
          <div className="space-y-6">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h3 className="font-display font-semibold text-lg text-slate-100 mb-1">
                  Bitácora Forense Inalterable (Digital Audits)
                </h3>
                <p className="text-xs text-slate-400">
                  Todas las transacciones, despachos, y firmas criptográficas se validan localmente y se registran de forma secuencial con hash SHA-256.
                </p>
              </div>

              <button
                onClick={handleClearForensics}
                className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpiar Registro
              </button>
            </div>

            {/* Forensics list table */}
            <div className="space-y-3 h-[300px] overflow-y-auto bg-slate-950 p-4 rounded-xl border border-slate-850">
              {forensicLogs.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-24">
                  No hay registros de auditoría forense disponibles.
                </div>
              ) : (
                forensicLogs.map((log, idx) => (
                  <div key={idx} className="border-b border-slate-900 pb-3 last:border-0 last:pb-0 text-xs space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-amber-400 font-bold">{log.timestamp}</span>
                      <span className="text-slate-500">IP: {log.ip}</span>
                    </div>
                    <div className="text-slate-200">
                      <strong>{log.user}</strong>: {log.action}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 truncate">
                      Dispositivo: {log.device} | Firma: {log.signature}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Firebase Architecture Overview & Realtime Sync Tab */}
        {subTab === 'firebase-architecture' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-display font-semibold text-lg text-slate-100 flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-400" />
                  Arquitectura del Backend Distribuido Firebase
                </h3>
                <p className="text-xs text-slate-400">
                  Infraestructura robusta para entornos críticos, optimizada para baja conectividad, tolerancia a fallas y sincronización offline-first.
                </p>
              </div>
              <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/40 border border-emerald-800 text-emerald-400 rounded-full text-[10px] font-mono uppercase tracking-wide">
                <Wifi className="w-3 h-3 text-emerald-500 animate-pulse" />
                Firebase Online
              </span>
            </div>

            {/* FLOW DIAGRAM */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Flujo de Propagación y Sincronización del Mensaje SOS</span>
              
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-center font-mono text-[10px]">
                <div className="bg-slate-900 border border-red-900/60 p-3 rounded-lg flex flex-col items-center justify-center space-y-1">
                  <Cpu className="w-5 h-5 text-red-500" />
                  <span className="text-white font-bold">1. Nodo BLE Emisor</span>
                  <p className="text-slate-500 text-[9px]">Empaca telemetría en 22 bytes en punto fijo. Emite por broadcast.</p>
                </div>
                
                <div className="flex items-center justify-center text-slate-600">➔➔➔</div>

                <div className="bg-slate-900 border border-indigo-900/60 p-3 rounded-lg flex flex-col items-center justify-center space-y-1">
                  <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                  <span className="text-white font-bold">2. BLE Mesh DTN</span>
                  <p className="text-slate-500 text-[9px]">Reenvío oportunista entre nodos (store-and-forward) con deduplicación y TTL.</p>
                </div>

                <div className="flex items-center justify-center text-slate-600">➔➔➔</div>

                <div className="bg-slate-900 border border-emerald-900/60 p-3 rounded-lg flex flex-col items-center justify-center space-y-1">
                  <CloudLightning className="w-5 h-5 text-emerald-400" />
                  <span className="text-white font-bold">3. Nodo Puente (Gateway)</span>
                  <p className="text-slate-500 text-[9px]">Recibe la trama BLE, recupera GPS, y efectúa la sincronización eventual con Firebase.</p>
                </div>
              </div>
            </div>

            {/* FIREBASE OPTIMIZATIONS IN EXTREME SCENARIOS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Firestore database structure */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
                <span className="text-[11px] font-mono text-emerald-400 uppercase font-bold flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  Colecciones Firestore de Producción
                </span>
                
                <div className="space-y-2 text-[11px] leading-relaxed">
                  <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                    <strong className="text-slate-200">/alerts (Emergencias SOS)</strong>
                    <p className="text-slate-400 text-[10px] mt-0.5">Almacena las coordenadas georreferenciadas, estado, tipo de emergencia y datos de batería.</p>
                  </div>
                  
                  <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                    <strong className="text-slate-200">/nodes (Estatus de Brigadas)</strong>
                    <p className="text-slate-400 text-[10px] mt-0.5">Registra la telemetría periódica de los rescatistas en campo para coordinar recursos de forma segura.</p>
                  </div>

                  <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                    <strong className="text-slate-200">/telemetry (Métricas Dijkstra)</strong>
                    <p className="text-slate-400 text-[10px] mt-0.5">Captura la tasa de saltos de paquetes (Hops), latencias y RSSI para estimar el mapa de enrutamiento offline.</p>
                  </div>
                </div>
              </div>

              {/* Offline-First / DTN Resilience strategy */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
                <span className="text-[11px] font-mono text-amber-400 uppercase font-bold flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5" />
                  Estrategia Offline-First / Resiliencia Crítica
                </span>

                <div className="space-y-3 text-[11px] text-slate-400 leading-relaxed">
                  <div>
                    <strong className="text-slate-200 block">Soporte Local PersistentCache</strong>
                    <p className="text-[10px] mt-0.5">El SDK de Firestore se inicializa con persistencia persistente multi-pestaña habilitada. Todo reporte creado offline se encola de forma segura en disco local.</p>
                  </div>

                  <div>
                    <strong className="text-slate-200 block">Sincronización Autonóma Eventual</strong>
                    <p className="text-[10px] mt-0.5">Al restablecerse la señal (conexión parcial o satelital), Firebase efectúa el volcado y la sincronización con la nube de forma transparente sin perder paquetes.</p>
                  </div>

                  <div>
                    <strong className="text-slate-200 block">Cloud Functions anti-replay & deduplicación</strong>
                    <p className="text-[10px] mt-0.5">Un disparador en la nube valida el MessageID de cada trama utilizando un historial de mensajes vistos para desechar solicitudes duplicadas y ataques de repetición.</p>
                  </div>
                </div>
              </div>

            </div>

            {/* CODE PREVIEW FOR PRODUCTION DEPLOYMENT */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Reglas de Seguridad Firestore (`firestore.rules`)</span>
              <pre className="bg-slate-900 p-3.5 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto leading-normal">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /alerts/{alertId} {
      allow read: if true; // Alertas públicas para evacuación civil segura
      allow create: if request.resource.data.messageId != null 
                    && request.resource.data.latitude >= -90.0 
                    && request.resource.data.latitude <= 90.0;
      allow update, delete: if request.auth != null; // Solo personal militar/brigadista
    }
  }`}
              </pre>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

