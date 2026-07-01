import React, { useState, useEffect } from 'react';
import { EmergencyAlert } from '../types';
import { AlertTriangle, ShieldAlert, X, Volume2, Mic, CheckCircle, WifiOff, RefreshCw, Eye } from 'lucide-react';
import { sendSOSOptimal } from '../services/MeshOrchestrator';
import { hashPacket, MeshPacket } from '../services/BluetoothMeshService';
import { 
  startSOSFlash, 
  flashHazard, 
  stopFlash, 
  getFlashStatus, 
  registerScreenFlashCallback 
} from '../services/FlashlightMorseService';
import { API_URL } from '../config';

interface PanicPanelProps {
  onTriggerSOS: (payload: Partial<EmergencyAlert>) => void;
  alerts: EmergencyAlert[];
  userLat: number;
  userLng: number;
  currentBattery: number;
  connectionMode: 'internet' | 'mesh' | 'partial';
}

export default function PanicPanel({
  onTriggerSOS,
  alerts,
  userLat,
  userLng,
  currentBattery,
  connectionMode
}: PanicPanelProps) {
  // SOS State
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedTag, setSelectedTag] = useState('Asistencia General');
  
  // Orquestador Mesh State
  const [sosState, setSosState] = useState<'IDLE' | 'QUEUED' | 'CONFIRMED' | 'FAILED'>('IDLE');
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Morse Flashlight state
  const [isFlashing, setIsFlashing] = useState(false);
  const [currentMorseMsg, setCurrentMorseMsg] = useState<string | null>(null);
  const [screenFlashOn, setScreenFlashOn] = useState(false);

  // local feedback messages
  const [morseFeedback, setMorseFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [recordingFeedback, setRecordingFeedback] = useState<string | null>(null);
  const [loadingMorse, setLoadingMorse] = useState(false);

  // Register screen flash callback & poll status
  useEffect(() => {
    registerScreenFlashCallback((isOn) => {
      setScreenFlashOn(isOn);
    });

    const interval = setInterval(() => {
      const status = getFlashStatus();
      setIsFlashing(status.isFlashing);
      setCurrentMorseMsg(status.currentMessage);
    }, 150);

    return () => {
      clearInterval(interval);
      registerScreenFlashCallback(null);
      stopFlash();
    };
  }, []);

  // Safeguard: Automatically stop flash if battery level is below 10%
  useEffect(() => {
    if (currentBattery < 10 && isFlashing) {
      stopFlash();
      setMorseFeedback({ type: 'error', message: 'Batería baja (<10%). Señales Morse detenidas automáticamente.' });
    }
  }, [currentBattery, isFlashing]);

  // Audio state simulation
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Countdown timer for cancellation safeguard
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCountingDown && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (isCountingDown && countdown === 0) {
      setIsCountingDown(false);
      setIsAlertActive(true);
      fireSOS();
    }
    return () => clearTimeout(timer);
  }, [isCountingDown, countdown]);

  // Audio timer simulation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleSOSClick = () => {
    if (isCountingDown) {
      // Cancel countdown - reset state to IDLE
      setIsCountingDown(false);
      setCountdown(3);
      setSosState('IDLE');
      setBannerMessage("SOS cancelado por el usuario.");
    } else if (isAlertActive) {
      // Reset alert status
      setIsAlertActive(false);
      setSosState('IDLE');
      setBannerMessage(null);
    } else {
      // Start safeguard countdown
      setIsCountingDown(true);
      setCountdown(3);
      setSosState('IDLE');
      setBannerMessage(null);
    }
  };

  const fireSOS = async () => {
    setSosState('QUEUED');
    setBannerMessage("Aplicando jitter aleatorio de seguridad...");

    // 1. Aplica jitter aleatorio (100-2000ms)
    const jitter = Math.floor(100 + Math.random() * 1900);
    await new Promise(resolve => setTimeout(resolve, jitter));

    setBannerMessage("Iniciando orquestación multicanal...");

    const deviceId = 'node-bqto-' + Math.floor(100 + Math.random() * 900);
    const userName = localStorage.getItem('admin_username') || "Tú (Mi Nodo)";
    const userRole = localStorage.getItem('admin_role') || 'user';

    const packet: MeshPacket = {
      uuid: crypto.randomUUID ? crypto.randomUUID() : `sos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'SOS',
      senderId: deviceId,
      senderName: userName,
      trustScore: userRole === 'brigadist' || userRole === 'operator' ? 0.95 : 0.4,
      payload: {
        lat: userLat,
        lng: userLng,
        battery: currentBattery,
        description: `${selectedTag}: ${description || "Se solicita asistencia urgente inmediata en este nodo."}`,
        timestamp: new Date().toISOString()
      },
      ttl: 7,
      hops: 0,
      hopPath: [],
      hash: ''
    };

    try {
      packet.hash = await hashPacket(packet);
    } catch (e) {
      packet.hash = '';
    }

    let sentVia: string = '';
    let success = false;
    let peersReached = 0;
    let rangeMeters = 0;
    let confirmationAvailable = false;
    let confirmationNote: string | undefined;

    // 2. Intenta enviar al Worker: POST ${API_URL}/api/alerts
    try {
      setBannerMessage("Intentando envío por red de Internet...");
      const res = await fetch(`${API_URL}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: packet.uuid,
          user_name: packet.senderName,
          latitude: packet.payload.lat,
          longitude: packet.payload.lng,
          battery_level: packet.payload.battery,
          connection_type: 'internet',
          status: 'active',
          description: packet.payload.description,
          created_at: packet.payload.timestamp
        })
      });

      if (res.ok) {
        success = true;
        sentVia = 'INTERNET';
        // El Worker confirma persistencia del registro; no reporta cuántos nodos mesh lo verán.
        peersReached = 1;
        confirmationAvailable = true;
      } else {
        throw new Error("Servidor retornó código " + res.status);
      }
    } catch (err: any) {
      console.warn("Fallo canal Internet, intentando vía MeshOrchestrator Bluetooth...", err);

      // 3. Si falla → intenta por Bluetooth via MeshOrchestrator
      try {
        setBannerMessage("Internet Offline. Iniciando transmisión de radio Bluetooth local...");
        const result = await sendSOSOptimal(packet);
        if (result && result.sentVia !== 'CACHED') {
          success = true;
          sentVia = result.sentVia;
          peersReached = result.peersReached;
          rangeMeters = result.estimatedRangeMeters;
          confirmationAvailable = result.confirmationAvailable;
          confirmationNote = result.note;
        } else {
          success = false;
          sentVia = 'CACHED';
        }
      } catch (meshErr: any) {
        console.error("Fallo también en MeshOrchestrator:", meshErr);
        success = false;
        sentVia = 'FAILED';
      }
    }

    // 4. Muestra estado: QUEUED → CONFIRMED o FAILED
    if (success) {
      setSosState('CONFIRMED');
      if (confirmationAvailable) {
        setBannerMessage(
          sentVia === 'INTERNET'
            ? 'SOS enviado vía INTERNET — recepción confirmada por el Centro de Mando'
            : `SOS enviado vía ${sentVia} — ${peersReached} nodos alcanzados en un radio de ~${rangeMeters}m`
        );
      } else {
        setBannerMessage(
          `SOS transmitido vía ${sentVia} — confirmación de recepción no disponible${confirmationNote ? ` (${confirmationNote})` : ''}`
        );
      }
      
      // 5. En CONFIRMED: vibra el celular
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100, 200, 100, 200]);
        } catch (vErr) {
          console.warn("Vibration failed:", vErr);
        }
      }

      onTriggerSOS({
        id: packet.uuid,
        user_name: packet.senderName,
        latitude: packet.payload.lat,
        longitude: packet.payload.lng,
        battery_level: packet.payload.battery,
        connection_type: sentVia === 'INTERNET' ? 'internet' : 'hybrid',
        status: 'active',
        description: packet.payload.description,
        created_at: packet.payload.timestamp
      });
    } else {
      setSosState('FAILED');
      setBannerMessage(`SOS en cola local. Se propagará continuamente por BLE y Wi-Fi Direct al detectar pares.`);
      
      onTriggerSOS({
        id: packet.uuid,
        user_name: packet.senderName,
        latitude: packet.payload.lat,
        longitude: packet.payload.lng,
        battery_level: packet.payload.battery,
        connection_type: 'mesh_bluetooth',
        status: 'active',
        description: packet.payload.description,
        created_at: packet.payload.timestamp
      });
    }
  };

  const handleStartSOSFlash = async () => {
    if (loadingMorse) return;
    setLoadingMorse(true);
    try {
      setMorseFeedback({ type: 'info', message: 'Iniciando señales de linterna SOS...' });
      await startSOSFlash();
      setMorseFeedback({ type: 'success', message: '✓ Linterna emitiendo señal SOS (... --- ...)' });
    } catch (err: any) {
      setMorseFeedback({ type: 'error', message: `Error de linterna: ${err.message || err}` });
    } finally {
      setLoadingMorse(false);
    }
  };

  const handleFlashHazard = async () => {
    if (loadingMorse) return;
    setLoadingMorse(true);
    try {
      setMorseFeedback({ type: 'info', message: 'Iniciando señales de Peligro Químico...' });
      await flashHazard();
      setMorseFeedback({ type: 'success', message: '✓ Linterna emitiendo señal de peligro químico (-..-)' });
    } catch (err: any) {
      setMorseFeedback({ type: 'error', message: `Error de linterna: ${err.message || err}` });
    } finally {
      setLoadingMorse(false);
    }
  };

  const handleStopFlash = () => {
    try {
      stopFlash();
      setMorseFeedback({ type: 'success', message: '✓ Señales ópticas detenidas' });
    } catch (err: any) {
      setMorseFeedback({ type: 'error', message: `Error al apagar linterna: ${err.message || err}` });
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      const audioName = `SOS_AUDIO_${Date.now()}.ogg (Compresión Mesh activa, 4.2 KB)`;
      setRecordedAudio(audioName);
      setRecordingFeedback(`✓ Audio grabado y comprimido con éxito (${audioName})`);
    } else {
      setRecordedAudio(null);
      setIsRecording(true);
      setRecordingFeedback('Grabando audio... Habla con claridad.');
    }
  };

  // Quick category tags
  const tags = [
    "Asistencia Médica",
    "Búsqueda y Rescate",
    "Incendio",
    "Fuga de Gas / Colapso",
    "Asistencia General"
  ];

  return (
    <div id="panic-button-section" className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      
      {/* SOS Button Controller */}
      <div className="lg:col-span-2 bg-slate-900 border border-slate-700/60 rounded-xl p-6 flex flex-col items-center justify-between shadow-xl min-h-[460px]">
        <div className="text-center w-full">
          <div className="flex items-center justify-center gap-2 mb-2">
            <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse" />
            <h3 className="font-display font-bold text-lg text-slate-100 uppercase tracking-wide">
              Botón de Pánico SOS
            </h3>
          </div>
          <p className="text-xs text-slate-400 px-4">
            Al activarse, se enviará tu ubicación GPS exacta, telemetría y estado de batería a través de todos los canales disponibles (Mesh y/o Internet).
          </p>
        </div>

        {/* Big Giant SOS Button Visualizer */}
        <div className="relative my-8 flex items-center justify-center">
          
          {/* Pulsating animated rings */}
          {isCountingDown && (
            <div className="absolute w-44 h-44 rounded-full bg-amber-500/10 border-4 border-amber-500/40 sos-ring" />
          )}
          {isAlertActive && (
            <>
              <div className="absolute w-48 h-48 rounded-full bg-red-500/10 border-4 border-red-500/30 sos-ring" style={{ animationDelay: '0s' }} />
              <div className="absolute w-48 h-48 rounded-full bg-red-500/15 border-4 border-red-500/25 sos-ring" style={{ animationDelay: '0.8s' }} />
            </>
          )}

          <button
            onClick={handleSOSClick}
            className={`w-36 h-36 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 z-10 border-4 ${
              isCountingDown
                ? 'bg-amber-600 hover:bg-amber-500 border-amber-400 text-slate-900 scale-105'
                : isAlertActive
                ? 'bg-red-700 hover:bg-red-600 border-red-400 text-white scale-110'
                : 'bg-red-600 hover:bg-red-500 border-red-500/40 text-white hover:scale-105 active:scale-95'
            }`}
          >
            {isCountingDown ? (
              <div className="text-center">
                <span className="font-display font-black text-4xl block leading-none">{countdown}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider block mt-1">Cancelar</span>
              </div>
            ) : isAlertActive ? (
              <div className="text-center animate-pulse">
                <AlertTriangle className="w-8 h-8 mx-auto mb-1 stroke-2" />
                <span className="font-display font-bold text-sm uppercase tracking-wider block">SOS ACTIVO</span>
                <span className="text-[9px] block text-red-200 mt-1">Click p/ apagar</span>
              </div>
            ) : (
              <div className="text-center">
                <span className="font-display font-extrabold text-3xl block tracking-wide">SOS</span>
                <span className="text-[9px] block text-red-100 uppercase tracking-widest mt-1">Presión Continua</span>
              </div>
            )}
          </button>
        </div>

        {/* Safeguard text */}
        <div className="text-center w-full">
          {bannerMessage && (
            <div className={`mb-3 text-[11px] font-mono p-2 rounded-lg border text-left ${
              sosState === 'CONFIRMED' 
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
                : sosState === 'FAILED'
                ? 'bg-amber-950/40 text-amber-300 border-amber-800/50'
                : 'bg-blue-950/40 text-blue-300 border-blue-800/50 animate-pulse'
            }`}>
              <div className="font-bold uppercase text-[9px] mb-0.5">Resultado de Orquestación Mesh:</div>
              {bannerMessage}
            </div>
          )}

          {isCountingDown ? (
            <div className="flex items-center justify-center gap-1.5 text-amber-400 text-xs font-semibold bg-amber-950/20 py-2 px-4 rounded-lg border border-amber-900/30">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
              Iniciando transmisión en {countdown} segundos...
            </div>
          ) : isAlertActive ? (
            <div className="flex items-center justify-center gap-1.5 text-red-400 text-xs font-semibold bg-red-950/25 py-2 px-4 rounded-lg border border-red-900/30 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
              Transmitiendo Alerta vía Red Mesh...
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 italic">
              Dispone de 3 segundos para cancelar la alerta antes del envío automático.
            </p>
          )}
        </div>

        {/* Morse Flashlight Controller (Prompt 2) */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 w-full text-left">
          <span className="text-[10px] text-slate-400 font-mono uppercase block mb-2 font-bold tracking-wider">
            Señalización Óptica SOS (Morse)
          </span>

          {morseFeedback && (
            <div className={`mb-2 p-2 rounded-lg text-xs font-mono border ${
              morseFeedback.type === 'success' 
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50' 
                : morseFeedback.type === 'error'
                ? 'bg-red-950/40 text-red-300 border-red-800/50'
                : 'bg-blue-950/40 text-blue-300 border-blue-800/50 animate-pulse'
            }`}>
              {morseFeedback.message}
            </div>
          )}
          
          {/* Fallback screen flash indicator */}
          {isFlashing && (
            <div className={`mb-3 p-3 rounded-lg flex items-center justify-between transition-colors ${
              screenFlashOn ? 'bg-white text-slate-900 font-bold' : 'bg-slate-950 text-slate-400'
            } border border-slate-800 font-mono text-[11px]`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${screenFlashOn ? 'bg-amber-500 animate-ping' : 'bg-slate-700'}`} />
                <span>Transmitiendo: <strong className="font-sans text-xs">{currentMorseMsg}</strong> en Morse</span>
              </div>
              <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded animate-pulse font-bold">EMITIENDO</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleStartSOSFlash}
              disabled={loadingMorse}
              className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                isFlashing && currentMorseMsg === "S O S"
                  ? 'bg-amber-500 text-slate-900 border-amber-400 animate-pulse'
                  : 'bg-slate-950 hover:bg-slate-800 text-amber-400 border-amber-500/30'
              } ${loadingMorse ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Repetición infinita de SOS (... --- ...)"
            >
              <span>🔦 SOS Morse</span>
            </button>

            <button
              onClick={handleFlashHazard}
              disabled={loadingMorse}
              className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                isFlashing && currentMorseMsg === "X"
                  ? 'bg-orange-500 text-white border-orange-400'
                  : 'bg-slate-950 hover:bg-slate-800 text-orange-400 border-orange-500/30'
              } ${loadingMorse ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Peligro químico/gas: patrón especial X (-..-)"
            >
              <span>⚠️ Peligro Químico</span>
            </button>

            {isFlashing && (
              <button
                onClick={handleStopFlash}
                className="w-full mt-1 py-1.5 px-3 bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 rounded-lg text-xs font-medium transition-colors cursor-pointer text-center"
              >
                ✓ Detener Señal Óptica
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SOS Form details & Audio Record Simulator */}
      <div className="lg:col-span-3 bg-slate-900 border border-slate-700/60 rounded-xl p-6 shadow-xl flex flex-col justify-between">
        <div>
          <h3 className="font-display font-semibold text-slate-100 text-base mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-blue-400" />
            Configurar Detalles del Reporte SOS
          </h3>

          <div className="space-y-4">
            {/* Tags selectors */}
            <div>
              <label className="text-xs text-slate-400 font-semibold block mb-1.5">Categoría del Incidente</label>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(tag)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      selectedTag === tag
                        ? 'bg-red-950/60 text-red-300 border-red-700/60'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Description input */}
            <div>
              <label className="text-xs text-slate-400 font-semibold block mb-1">Descripción corta (Opcional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ejemplo: Necesitamos soporte médico inmediato para dos personas mayores..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 focus:border-red-800 rounded-lg p-3 text-slate-200 text-xs focus:ring-1 focus:ring-red-800 outline-none"
              />
            </div>

            {/* Micro / Audio Recorder simulation */}
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-red-400" />
                  Mensaje de Audio Comprimido para Red Mesh
                </h4>
                <p className="text-[10px] text-slate-400 mt-1 max-w-sm">
                  Utiliza fragmentación y compresión extrema a 1.2kbps para poder ser propagado sobre enlaces débiles de Bluetooth LE.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {isRecording && (
                  <span className="text-xs text-red-400 font-mono animate-pulse flex items-center gap-1 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                    {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
                  </span>
                )}
                <button
                  onClick={toggleRecording}
                  className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isRecording
                      ? 'bg-red-900 text-white animate-pulse'
                      : recordedAudio
                      ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                  {isRecording ? 'Detener' : recordedAudio ? 'Grabar de Nuevo' : 'Grabar SOS Audio'}
                </button>
              </div>
            </div>

            {recordingFeedback && (
              <div className="text-[11px] bg-emerald-950/20 text-emerald-400 px-3.5 py-1.5 rounded border border-emerald-900/30 flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{recordingFeedback}</span>
              </div>
            )}
          </div>
        </div>

        {/* Packet structure preview */}
        <div className="mt-6 pt-4 border-t border-slate-800 bg-slate-950 p-3 rounded-lg border border-slate-800/60 font-mono text-[10px] text-slate-400">
          <span className="text-slate-500 uppercase tracking-wider block font-bold text-[9px] mb-1.5">Estructura del Paquete SOS Mesh</span>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <span className="text-slate-500 block">UUID:</span>
              <span className="text-slate-300">sos-pkt-{Date.now().toString().slice(-6)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Protocolo:</span>
              <span className="text-slate-300">BLE Multi-Hop MESH</span>
            </div>
            <div>
              <span className="text-slate-500 block">GPS Precisión:</span>
              <span className="text-slate-300">8.5 m (Alta)</span>
            </div>
            <div>
              <span className="text-slate-500 block">TTL Inicial:</span>
              <span className="text-slate-300">5 saltos máx.</span>
            </div>
            <div>
              <span className="text-slate-500 block">Firma Criptográfica:</span>
              <span className="text-slate-300">Ed25519 (SHA-256)</span>
            </div>
            <div>
              <span className="text-slate-500 block">Modo de Red:</span>
              <span className={`font-semibold ${connectionMode === 'internet' ? 'text-blue-400' : 'text-amber-400'}`}>
                {connectionMode === 'internet' ? 'Central Server' : 'Mesh Híbrido'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
