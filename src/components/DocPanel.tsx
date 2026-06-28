import React, { useState } from 'react';
import { BookOpen, Layers, GitBranch, Database, Shield, Zap, FileCode, Cpu, Radio, Compass, RefreshCw } from 'lucide-react';
import Logo from './Logo';
import { encodeRedSOSPacket, decodeRedSOSPacket } from '../utils/bleProtocol';

export default function DocPanel() {
  const [docTab, setDocTab] = useState<'c4' | 'sequence' | 'erd' | 'openapi' | 'manual' | 'bluetooth'>('c4');

  // Estados del Simulador de Empaquetado Binario BLE RedSOS (Estándar NASA/GIS)
  const [simLat, setSimLat] = useState<number>(10.0735);
  const [simLng, setSimLng] = useState<number>(-69.3475);
  const [simBattery, setSimBattery] = useState<number>(85);
  const [simTtl, setSimTtl] = useState<number>(8);
  const [simMsgId, setSimMsgId] = useState<number>(1024);
  const [simType, setSimType] = useState<number>(0);
  const [simFlags, setSimFlags] = useState<number>(1); // Bitmask (ej. 1 = SOS Médico)

  return (
    <div id="documentation-hub" className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      
      {/* Documentation index tabs column */}
      <div className="lg:col-span-1 bg-slate-900 border border-slate-700/60 p-4 rounded-xl flex flex-col gap-1 shadow-xl h-fit">
        <h3 className="font-display font-semibold text-slate-100 text-sm mb-3 px-2 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-amber-500" />
          Especificación Técnica
        </h3>

        <button
          onClick={() => setDocTab('c4')}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${
            docTab === 'c4'
              ? 'bg-amber-950/40 text-amber-300 border-amber-800'
              : 'text-slate-400 border-transparent hover:bg-slate-950 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Modelo Arquitectura C4
        </button>

        <button
          onClick={() => setDocTab('sequence')}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${
            docTab === 'sequence'
              ? 'bg-amber-950/40 text-amber-300 border-amber-800'
              : 'text-slate-400 border-transparent hover:bg-slate-950 hover:text-slate-200'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          Diagramas de Secuencia UML
        </button>

        <button
          onClick={() => setDocTab('erd')}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${
            docTab === 'erd'
              ? 'bg-amber-950/40 text-amber-300 border-amber-800'
              : 'text-slate-400 border-transparent hover:bg-slate-950 hover:text-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          Modelo de Datos ERD
        </button>

        <button
          onClick={() => setDocTab('openapi')}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${
            docTab === 'openapi'
              ? 'bg-amber-950/40 text-amber-300 border-amber-800'
              : 'text-slate-400 border-transparent hover:bg-slate-950 hover:text-slate-200'
          }`}
        >
          <FileCode className="w-4 h-4" />
          OpenAPI / Swagger Spec
        </button>

        <button
          onClick={() => setDocTab('manual')}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${
            docTab === 'manual'
              ? 'bg-amber-950/40 text-amber-300 border-amber-800'
              : 'text-slate-400 border-transparent hover:bg-slate-950 hover:text-slate-200'
          }`}
        >
          <Shield className="w-4 h-4" />
          Manual de Operación Civil
        </button>

        <button
          onClick={() => setDocTab('bluetooth')}
          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${
            docTab === 'bluetooth'
              ? 'bg-amber-950/40 text-amber-300 border-amber-800'
              : 'text-slate-400 border-transparent hover:bg-slate-950 hover:text-slate-200'
          }`}
        >
          <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
          Integración BLE Mesh
        </button>
      </div>

      {/* Detail documentation frame column */}
      <div className="lg:col-span-3 bg-slate-900 border border-slate-700/60 p-6 rounded-xl shadow-xl min-h-[460px]">
        
        {/* C4 MODEL TAB */}
        {docTab === 'c4' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-center gap-6 p-6 bg-slate-950 rounded-2xl border border-slate-800/80">
              <Logo size="lg" showText={true} animate={true} />
              <div className="space-y-3 flex-1">
                <span className="text-[10px] font-mono font-bold text-red-500 uppercase tracking-widest bg-red-950/40 px-2 py-0.5 rounded border border-red-900/50">
                  Identidad Oficial RedSOS
                </span>
                <h4 className="font-display font-black text-2xl text-white">RedSOS Mesh</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Esta plataforma de telecomunicaciones descentralizada e híbrida provee coordinación total ante escenarios críticos de colapso de infraestructura de Internet y telefonía convencional.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 text-[10px] font-mono px-2.5 py-0.5 rounded-lg font-bold">
                    🚀 Criptografía AES-256 + Ed25519
                  </span>
                  <span className="bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 text-[10px] font-mono px-2.5 py-0.5 rounded-lg font-bold">
                    📡 Enrutamiento Multi-Hop Inteligente
                  </span>
                  <span className="bg-amber-950/60 border border-amber-800/40 text-amber-400 text-[10px] font-mono px-2.5 py-0.5 rounded-lg font-bold">
                    ⚡ IA Gemini Copilot de Desastres
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-display font-semibold text-lg text-slate-100 mb-2">
                Arquitectura de Contenedores RedSOS Mesh (C4 Model)
              </h3>
              <p className="text-xs text-slate-400">
                Detalla cómo interactúan los dispositivos móviles entre sí para propagar los paquetes de emergencia sin depender de redes de telefonía convencional.
              </p>
            </div>

            {/* Visual SVG diagram chart */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto">
              <div className="min-w-[600px] flex flex-col items-center gap-6 py-4">
                
                {/* Level 1: Users */}
                <div className="grid grid-cols-3 gap-6 w-full max-w-lg">
                  <div className="bg-blue-950/80 border border-blue-800 p-3 rounded-lg text-center text-xs">
                    <strong className="text-blue-300 block">Mi Dispositivo</strong>
                    <span className="text-[10px] text-slate-400 block mt-1">(Nodo Emisor)</span>
                  </div>
                  <div className="bg-indigo-950/80 border border-indigo-800 p-3 rounded-lg text-center text-xs flex items-center justify-center">
                    <span className="text-slate-300 font-bold">➔ BLE / WiFi Direct ➔</span>
                  </div>
                  <div className="bg-emerald-950/80 border border-emerald-800 p-3 rounded-lg text-center text-xs">
                    <strong className="text-emerald-300 block">Nodos Vecinos (Mesh)</strong>
                    <span className="text-[10px] text-slate-400 block mt-1">(Brigadistas / Repetidores)</span>
                  </div>
                </div>

                {/* Vertical arrow */}
                <div className="text-slate-500 text-lg">⬇ (Multi-Hop Routing)</div>

                {/* Level 2: Gateway Nodes */}
                <div className="bg-amber-950/80 border border-amber-800 p-3 rounded-lg text-center text-xs w-full max-w-sm">
                  <strong className="text-amber-300 block">Nodo Gateway / Puente (Estación Base)</strong>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Conexión parcial a internet. Acumula tramas fuera de línea y realiza el volcado al recuperar señal.
                  </p>
                </div>

                {/* Vertical arrow */}
                <div className="text-slate-500 text-lg">⬇ (REST API / WebSockets)</div>

                {/* Level 3: Central Server & database */}
                <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                  <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-center text-xs">
                    <strong className="text-slate-200 block">Backend Server</strong>
                    <span className="text-[9px] text-slate-400">Node.js Express + Gemini AI</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-center text-xs">
                    <strong className="text-slate-200 block">Central Database</strong>
                    <span className="text-[9px] text-slate-400">PostgreSQL (Durable Cloud)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-300 space-y-2 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h4 className="font-display font-semibold text-amber-400 text-sm">Flujo de Propagación Descentralizado:</h4>
              <p>
                1. **Generación local**: El emisor firma criptográficamente un paquete de pánico SOS (SHA-256) y lo inyecta por Bluetooth LE en canales publicitarios públicos de corto alcance.
              </p>
              <p>
                2. **Siguiente Salto (Retransmisión)**: Cada dispositivo receptor valida si ya procesó ese mensaje mediante el Hash SHA-256 único. Si no, decrementa el TTL e inicia la retransmisión.
              </p>
              <p>
                3. **Gateway Uplink**: Al menos un nodo con conexión satelital o celular activa retransmite la información del paquete Mesh al servidor Express, donde se actualiza el panel nacional de respuesta civil.
              </p>
            </div>
          </div>
        )}

        {/* SEQUENCE DIAGRAM TAB */}
        {docTab === 'sequence' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-100 mb-2">
                Diagrama de Secuencia UML: Propagación de SOS sin Internet
              </h3>
              <p className="text-xs text-slate-400">
                Muestra la sincronización exacta y las tramas de retransmisión desde que un usuario oprime el botón SOS hasta que llega a los rescatistas.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[10px] text-slate-300 leading-relaxed overflow-x-auto">
              <pre className="min-w-[500px]">
{`[TÚ]                 [NODO VECINO]            [ESTACIÓN BASE]         [CENTRAL CLOUD]
  |                         |                        |                       |
  |-- (1) Pulsa SOS -------->|                        |                       |
  |   (Firma SHA-256, TTL:5) |                        |                       |
  |                         |-- (2) Valida y reenvía >|                       |
  |                         |   (TTL: 4, Saltos: 1)  |                       |
  |                         |                        |                       |
  |                         |                        |-- (3) Sync REST API ->|
  |                         |                        |   (Carga de datos)    |-- (4) Activa Gemini
  |                         |                        |<----------------------|   Operator Response
  |                         |                        |                       |
  |                         |<-- (5) Recibe ACK -----|                       |
  |                         |   (Sincronización ok)  |                       |
  |<-- (6) Notifica entrega -|                        |                       |
  |   (Indicador en Mapa)   |                        |                       |`}
              </pre>
            </div>

            <div className="p-4 bg-amber-950/20 text-amber-400 border border-amber-900/40 rounded-lg text-xs">
              <h4 className="font-bold">Protocolo de Evitación de Tormenta de Paquetes:</h4>
              <p className="mt-1">
                Para prevenir colapso de espectro por retransmisiones duplicadas, cada nodo mesh local utiliza un búfer circular de hash SHA-256 de los últimos 200 mensajes. Cualquier coincidencia es inmediatamente descartada.
              </p>
            </div>
          </div>
        )}

        {/* ENTITY RELATIONSHIP DIAGRAM */}
        {docTab === 'erd' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-100 mb-2">
                Modelo de Datos de Emergencia (Diagrama ERD)
              </h3>
              <p className="text-xs text-slate-400">
                Diseño optimizado de tablas relacionales de PostgreSQL preparadas para millones de registros simultáneos de telemetría de ubicación y chat de desastres.
              </p>
            </div>

            {/* Grid display of tables */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
                <strong className="text-amber-400 font-mono block border-b border-slate-800 pb-1.5 mb-2">Table: users</strong>
                <ul className="space-y-1 font-mono text-[10px] text-slate-300">
                  <li>🔑 id (UUID)</li>
                  <li>📞 phone_number (VARCHAR)</li>
                  <li>🏷️ display_name (VARCHAR)</li>
                  <li>🛡️ role (VARCHAR)</li>
                  <li>🔋 battery_level (INT)</li>
                  <li>🕒 last_active (TIMESTAMP)</li>
                </ul>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
                <strong className="text-amber-400 font-mono block border-b border-slate-800 pb-1.5 mb-2">Table: alerts</strong>
                <ul className="space-y-1 font-mono text-[10px] text-slate-300">
                  <li>🔑 id (UUID)</li>
                  <li>👤 user_id (UUID - FK)</li>
                  <li>📍 latitude, longitude (DOUBLE)</li>
                  <li>🧭 altitude, speed, bearing (REAL)</li>
                  <li>📡 connection_type (VARCHAR)</li>
                  <li>📝 status (VARCHAR)</li>
                </ul>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
                <strong className="text-amber-400 font-mono block border-b border-slate-800 pb-1.5 mb-2">Table: messages</strong>
                <ul className="space-y-1 font-mono text-[10px] text-slate-300">
                  <li>🔑 id (UUID)</li>
                  <li>💬 chat_id (UUID - FK)</li>
                  <li>👤 sender_id (UUID - FK)</li>
                  <li>📜 content (TEXT)</li>
                  <li>🧬 uuid (VARCHAR) - Mesh ID</li>
                  <li>🔢 ttl, hops (INT)</li>
                  <li>🔑 hash_sha256 (VARCHAR)</li>
                </ul>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
                <strong className="text-amber-400 font-mono block border-b border-slate-800 pb-1.5 mb-2">Table: mesh_neighbors</strong>
                <ul className="space-y-1 font-mono text-[10px] text-slate-300">
                  <li>🔑 id (UUID)</li>
                  <li>🏷️ node_name (VARCHAR)</li>
                  <li>📶 signal_dbm (INT)</li>
                  <li>🔋 battery_level (INT)</li>
                  <li>📍 latitude, longitude (DOUBLE)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* OPENAPI TAB */}
        {docTab === 'openapi' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-100 mb-2">
                Especificación OpenAPI v3.0 / Swagger API
              </h3>
              <p className="text-xs text-slate-400">
                Puntos de contacto REST HTTP habilitados en el servidor para el despliegue del panel administrativo nacional.
              </p>
            </div>

            {/* Endpoints blocks */}
            <div className="space-y-4">
              
              {/* GET /api/nodes */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden text-xs">
                <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-950 text-emerald-400 font-bold px-2 py-0.5 rounded text-[10px]">GET</span>
                    <strong className="font-mono text-slate-200">/api/nodes</strong>
                  </div>
                  <span className="text-slate-500 text-[10px]">Obtener vecinos Mesh activos</span>
                </div>
                <div className="p-3 font-mono text-[10px] text-slate-400">
                  <span className="text-slate-500 block mb-1">Response JSON:</span>
                  <pre className="text-slate-300">{`[
  { "id": "node-1", "name": "Estación Central Base", "signal": -45, "battery": 100 }
]`}</pre>
                </div>
              </div>

              {/* POST /api/alerts */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden text-xs">
                <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-950 text-blue-400 font-bold px-2 py-0.5 rounded text-[10px]">POST</span>
                    <strong className="font-mono text-slate-200">/api/alerts</strong>
                  </div>
                  <span className="text-slate-500 text-[10px]">Registrar alerta de pánico SOS</span>
                </div>
                <div className="p-3 font-mono text-[10px] text-slate-400">
                  <span className="text-slate-500 block mb-1">Request Body (JSON):</span>
                  <pre className="text-slate-300">{`{
  "latitude": 19.4326,
  "longitude": -99.1332,
  "battery_level": 92,
  "description": "Herida médica profunda"
}`}</pre>
                </div>
              </div>

              {/* POST /api/messages */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden text-xs">
                <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-950 text-blue-400 font-bold px-2 py-0.5 rounded text-[10px]">POST</span>
                    <strong className="font-mono text-slate-200">/api/messages</strong>
                  </div>
                  <span className="text-slate-500 text-[10px]">Enviar mensaje para retransmisión o IA</span>
                </div>
                <div className="p-3 font-mono text-[10px] text-slate-400">
                  <span className="text-slate-500 block mb-1">Request Body (JSON):</span>
                  <pre className="text-slate-300">{`{
  "sender_name": "Tú",
  "content": "¿Cómo dar reanimación cardiopulmonar?",
  "type": "text"
}`}</pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MANUAL TAB */}
        {docTab === 'manual' && (
          <div className="space-y-6 text-slate-300 text-xs leading-relaxed">
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-100 mb-2">
                Manual del Administrador y Protección Civil
              </h3>
              <p className="text-slate-400 text-xs">
                Guía rápida de despliegue de emergencia táctico de RedSOS Mesh en zonas de catástrofe.
              </p>
            </div>

            <div className="space-y-4">
              <section className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <h4 className="font-display font-bold text-slate-100 flex items-center gap-1.5 mb-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  1. Despliegue de Estaciones de Enlace (Gateways)
                </h4>
                <p>
                  Coloque un dispositivo con batería cargada o celda solar en una posición elevada (azotea de edificios seguros). Configure este dispositivo en rol **Operator** para servir como nodo puente colector del sector.
                </p>
              </section>

              <section className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <h4 className="font-display font-bold text-slate-100 flex items-center gap-1.5 mb-1.5">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  2. Registro de Brigadistas Civiles
                </h4>
                <p>
                  Los brigadistas deben escanear los códigos QR generados por la base para cargar sus firmas Ed25519 en la base de datos distribuida local, asegurando prioridad y veracidad de reportes.
                </p>
              </section>

              <section className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <h4 className="font-display font-bold text-slate-100 flex items-center gap-1.5 mb-1.5">
                  <BookOpen className="w-4 h-4 text-blue-400" />
                  3. Mitigación contra Suplantación
                </h4>
                <p>
                  Cualquier nodo que intente propagar mensajes con una firma inválida o timestamps alterados (por más de 120 segundos) será catalogado como nodo hostil e ignorado automáticamente de forma pasiva por toda la red celular de la vecindad.
                </p>
              </section>
            </div>
          </div>
        )}

        {/* BLUETOOTH MESH SPECIFICATION TAB */}
        {docTab === 'bluetooth' && (() => {
          let hexBytes: string[] = [];
          let decodedResult: any = null;
          let calculatedLatInt = Math.round(simLat * 1e6);
          let calculatedLngInt = Math.round(simLng * 1e6);
          
          try {
            const rawBuffer = encodeRedSOSPacket({
              type: simType,
              messageId: simMsgId,
              latitude: simLat,
              longitude: simLng,
              battery: simBattery,
              ttl: simTtl,
              flags: simFlags,
              reserved: 0
            });
            
            const u8 = new Uint8Array(rawBuffer);
            u8.forEach(b => {
              hexBytes.push(b.toString(16).toUpperCase().padStart(2, '0'));
            });

            decodedResult = decodeRedSOSPacket(rawBuffer);
          } catch (err) {
            console.error(err);
          }

          return (
            <div className="space-y-6 text-slate-300 text-xs leading-relaxed">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-display font-semibold text-lg text-slate-100">
                    Especificación de Integración BLE Mesh
                  </h3>
                  <p className="text-slate-400 text-xs">
                    Requerimientos físicos, empaquetado binario y simulación de tramas de radiofrecuencia (NASA / IEEE).
                  </p>
                </div>
                <span className="px-2 py-0.5 bg-blue-950/40 border border-blue-800 text-blue-400 rounded text-[9px] font-mono uppercase tracking-wide font-bold">
                  Estándar IoT Militar / Civil
                </span>
              </div>

              {/* LIVE BINARY ENCODER / DECODER SIMULATOR */}
              <div className="bg-slate-950 rounded-xl border border-slate-800/80 p-5 space-y-4">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Cpu className="w-4 h-4 text-blue-500 animate-pulse" />
                  <span>Simulador Interactivo de Empaque Binario RedSOS (22 Bytes)</span>
                </div>
                
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Manipula los campos de telemetría a continuación para observar cómo el motor de RedSOS escala las coordenadas a enteros de 32 bits (fixed-point precision) y genera la firma hexadecimal de integridad para su emisión en el canal publicitario BLE.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-900/50 p-4 rounded-lg border border-slate-800">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 uppercase font-mono">Tipo de Mensaje</label>
                    <select
                      value={simType}
                      onChange={(e) => setSimType(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white"
                    >
                      <option value="0">0: Alerta SOS Crítica</option>
                      <option value="1">1: ACK Sincronización</option>
                      <option value="2">2: Beacon Estado de Salud</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 uppercase font-mono">Message ID (0-65535)</label>
                    <input
                      type="number"
                      value={simMsgId}
                      onChange={(e) => setSimMsgId(Math.max(0, Math.min(65535, Number(e.target.value))))}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 uppercase font-mono">Batería Emisor ({simBattery}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={simBattery}
                      onChange={(e) => setSimBattery(Number(e.target.value))}
                      className="w-full accent-blue-500 h-1 mt-2.5"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 uppercase font-mono">Latitud (Gis Decimal)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={simLat}
                      onChange={(e) => setSimLat(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-xs text-white"
                    />
                    <span className="text-[9px] text-slate-500 block font-mono">Scaled Int32: {calculatedLatInt}</span>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 uppercase font-mono">Longitud (Gis Decimal)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={simLng}
                      onChange={(e) => setSimLng(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-xs text-white"
                    />
                    <span className="text-[9px] text-slate-500 block font-mono">Scaled Int32: {calculatedLngInt}</span>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 uppercase font-mono">TTL (Saltos Mesh: {simTtl})</label>
                    <input
                      type="range"
                      min="1"
                      max="15"
                      value={simTtl}
                      onChange={(e) => setSimTtl(Number(e.target.value))}
                      className="w-full accent-blue-500 h-1 mt-2.5"
                    />
                  </div>
                </div>

                {/* Hex payload frame */}
                <div className="space-y-2">
                  <span className="text-[10px] text-blue-400 font-mono uppercase font-bold block">Trama Binaria Resultante BLE Advertising Payload (22 Bytes):</span>
                  <div className="bg-slate-950 border border-blue-900/40 p-4 rounded-lg font-mono text-center tracking-widest text-sm text-white flex flex-wrap gap-1.5 justify-center">
                    {hexBytes.map((byte, idx) => (
                      <span 
                        key={idx} 
                        className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                          idx === 0 ? 'bg-red-950 text-red-400 border border-red-800/60' :
                          idx >= 1 && idx <= 2 ? 'bg-indigo-950 text-indigo-400 border border-indigo-800/60' :
                          idx >= 3 && idx <= 6 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' :
                          idx >= 7 && idx <= 10 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' :
                          idx === 11 ? 'bg-amber-950 text-amber-400 border border-amber-800/60' :
                          idx === 12 ? 'bg-purple-950 text-purple-400 border border-purple-800/60' :
                          idx === 13 ? 'bg-slate-800 text-slate-300 border border-slate-700/60' :
                          idx >= 14 && idx <= 17 ? 'bg-sky-950 text-sky-400 border border-sky-800/60 font-bold' :
                          'bg-slate-900 text-slate-500 border border-slate-800'
                        }`}
                        title={`Byte ${idx}: ${
                          idx === 0 ? 'Type' :
                          idx >= 1 && idx <= 2 ? 'Message ID' :
                          idx >= 3 && idx <= 6 ? 'Latitude Scaled Int32' :
                          idx >= 7 && idx <= 10 ? 'Longitude Scaled Int32' :
                          idx === 11 ? 'Battery level' :
                          idx === 12 ? 'TTL (Time To Live)' :
                          idx === 13 ? 'Flags Bitmask' :
                          idx >= 14 && idx <= 17 ? 'Integrity Checksum Hash' :
                          'Reserved Space'
                        }`}
                      >
                        {byte}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-between text-[9px] text-slate-500 font-mono">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Tipo</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> ID Mensaje</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> GPS Lat/Lon Escalado</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Batería</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> TTL</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500"></span> Checksum Hash</span>
                  </div>
                </div>

                {/* Simulated decoding validation feedback */}
                {decodedResult && (
                  <div className="bg-slate-900/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" />
                      Fidelidad de la Decodificación de Recepción (Loopback Test):
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[10px] text-slate-300">
                      <div>GPS Latitud: <strong className="text-white">{decodedResult.latitude.toFixed(6)}</strong></div>
                      <div>GPS Longitud: <strong className="text-white">{decodedResult.longitude.toFixed(6)}</strong></div>
                      <div>Batería: <strong className="text-white">{decodedResult.battery}%</strong></div>
                      <div>Saltos TTL: <strong className="text-white">{decodedResult.ttl}</strong></div>
                    </div>
                  </div>
                )}
              </div>

              {/* TECHNICAL INTEGRATION ANALYSIS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                  <h4 className="font-display font-semibold text-amber-400 text-xs">🌐 Requerimientos de la Web (Web Bluetooth)</h4>
                  <ul className="space-y-1 text-[11px] text-slate-400 list-disc pl-4">
                    <li><strong>HTTPS Obligatorio:</strong> Solo se permite el escaneo y conexión GATT bajo TLS válido.</li>
                    <li><strong>Acción explícita:</strong> Requiere click o interacción humana para iniciar el cuadro de diálogo de emparejamiento.</li>
                    <li><strong>Navegadores:</strong> Soportado plenamente en Chrome, Edge y Opera (Chromium). No compatible con Safari iOS de Apple.</li>
                  </ul>
                </div>

                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                  <h4 className="font-display font-semibold text-emerald-400 text-xs">📱 Requerimientos de la App Móvil (Nativa/Capacitor)</h4>
                  <ul className="space-y-1 text-[11px] text-slate-400 list-disc pl-4">
                    <li><strong>Android Foreground Service:</strong> Servicio persistente con notificación visible del sistema para evitar suspensión de hilos BLE.</li>
                    <li><strong>iOS CoreBluetooth Modes:</strong> Declaración obligatoria de <code className="bg-slate-900 px-1 py-0.5 rounded text-white text-[10px]">bluetooth-central</code> para background scanning continuo.</li>
                    <li><strong>Permisos de Localización:</strong> Acceso continuo de fondo (Background Location) para asociar el mapeo del espectro de radio.</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 bg-blue-950/20 text-blue-400 border border-blue-900/40 rounded-lg text-[11px] space-y-1">
                <h4 className="font-bold">Algoritmo de Malla (Store-and-Forward / Inundación Inteligente):</h4>
                <p>
                  Cuando un nodo recibe este paquete, valida si ya fue procesado mediante el ID único de Mensaje y el Hash. Si no es duplicado y el TTL es mayor a 0, decrementa el TTL e inmediatamente retransmite los bytes por anuncios BLE. Si el nodo cuenta con conexión celular o WiFi activa, actúa como nodo puente (Gateway) y efectúa el volcado inmediato al Backend Central (Supabase) para reflejarse en tiempo real en este panel.
                </p>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
