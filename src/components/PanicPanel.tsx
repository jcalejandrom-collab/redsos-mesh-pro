import React, { useState, useEffect } from 'react';
import { EmergencyAlert } from '../types';
import { AlertTriangle, ShieldAlert, X, Volume2, Mic, CheckCircle, WifiOff, RefreshCw } from 'lucide-react';

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
      // Cancel countdown
      setIsCountingDown(false);
      setCountdown(3);
    } else if (isAlertActive) {
      // Reset alert status
      setIsAlertActive(false);
    } else {
      // Start safeguard countdown
      setIsCountingDown(true);
      setCountdown(3);
    }
  };

  const fireSOS = () => {
    const payload: Partial<EmergencyAlert> = {
      user_name: "Tú (Mi Nodo)",
      latitude: userLat,
      longitude: userLng,
      altitude: 2240,
      accuracy: 8.5,
      speed: 0.0,
      battery_level: currentBattery,
      connection_type: connectionMode === 'internet' ? 'internet' : connectionMode === 'mesh' ? 'mesh_bluetooth' : 'hybrid',
      description: `${selectedTag}: ${description || "Se solicita asistencia urgente inmediata en este nodo."}`,
      audio_url: recordedAudio
    };
    onTriggerSOS(payload);
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      // Simulate recorded audio payload
      setRecordedAudio(`SOS_AUDIO_${Date.now()}.ogg (Simulado, 4.2 KB, Compresión Mesh activa)`);
    } else {
      setRecordedAudio(null);
      setIsRecording(true);
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
                  className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
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

            {recordedAudio && (
              <div className="text-[11px] bg-emerald-950/20 text-emerald-400 px-3.5 py-1.5 rounded border border-emerald-900/30 flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Audio adjuntado con éxito: <strong className="font-mono">{recordedAudio}</strong></span>
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
