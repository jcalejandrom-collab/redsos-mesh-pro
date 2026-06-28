import React, { useState } from 'react';
import { ChatMessage } from '../types';
import { Send, Radio, Heart, AlertCircle, Shield, Sparkles, Navigation, Volume2, Paperclip, MessageSquare, Check, CheckCheck } from 'lucide-react';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (content: string, type?: 'text' | 'location' | 'audio') => void;
  userLat: number;
  userLng: number;
}

type Channel = 'broadcast' | 'brigade' | 'family' | 'ai';

export default function ChatPanel({
  messages,
  onSendMessage,
  userLat,
  userLng
}: ChatPanelProps) {
  const [activeChannel, setActiveChannel] = useState<Channel>('broadcast');
  const [inputText, setInputText] = useState('');

  // Handle message sending
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText, 'text');
    setInputText('');
  };

  const handleSendLocation = () => {
    const locString = `📍 Ubicación actual: Lat: ${userLat.toFixed(5)}, Lng: ${userLng.toFixed(5)}`;
    onSendMessage(locString, 'location');
  };

  const handleSendQuickAction = (msg: string) => {
    onSendMessage(msg, 'text');
  };

  // Filter messages based on active channel
  const filteredMessages = messages.filter(msg => {
    if (activeChannel === 'ai') {
      return msg.sender_name === 'Asistente Inteligente RedSOS' || msg.sender_name === 'Tú (Mi Nodo)' && msg.content.toLowerCase().includes('ayuda') || msg.content.toLowerCase().includes('operador') || msg.content.toLowerCase().includes('sos') || msg.content.toLowerCase().includes('primeros auxilios') || msg.content.toLowerCase().includes('sismo');
    }
    if (activeChannel === 'brigade') {
      return msg.sender_name.includes('Brigada') || msg.sender_name === 'Tú (Mi Nodo)';
    }
    if (activeChannel === 'family') {
      return msg.sender_name.includes('Familiar') || msg.sender_name === 'Sofía' || msg.sender_name === 'Tú (Mi Nodo)';
    }
    // Broadcast channel shows everything
    return msg.sender_name !== 'Asistente Inteligente RedSOS';
  });

  // Preset quick response messages
  const quickResponses = [
    "🚨 Necesitamos agua/comida",
    "🩺 Requerimos primeros auxilios",
    "🏚️ Estructura inestable / Escombros",
    "🔋 Nivel de batería bajo (Apagando WiFi)",
    "🟢 Todo sin novedades en este sector"
  ];

  return (
    <div id="mesh-chat-layout" className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-slate-900 border border-slate-700/60 rounded-xl overflow-hidden shadow-2xl min-h-[500px]">
      
      {/* Channels Sidebar List */}
      <div className="bg-slate-950 border-r border-slate-800 p-4 flex flex-col justify-between">
        <div>
          <h3 className="font-display font-semibold text-slate-100 text-sm mb-4 px-2 tracking-wide uppercase">
            Canales de Comunicación
          </h3>
          
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveChannel('broadcast')}
              className={`w-full text-left px-3.5 py-3 rounded-lg text-xs font-semibold flex items-center justify-between border transition-all ${
                activeChannel === 'broadcast'
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800'
                  : 'text-slate-400 border-transparent hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>Mesh Broadcast (General)</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </button>

            <button
              onClick={() => setActiveChannel('brigade')}
              className={`w-full text-left px-3.5 py-3 rounded-lg text-xs font-semibold flex items-center justify-between border transition-all ${
                activeChannel === 'brigade'
                  ? 'bg-amber-950/40 text-amber-300 border-amber-800'
                  : 'text-slate-400 border-transparent hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Brigada de Rescate Alpha</span>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-amber-900 text-[9px] text-amber-300 font-bold uppercase">Equipo</span>
            </button>

            <button
              onClick={() => setActiveChannel('family')}
              className={`w-full text-left px-3.5 py-3 rounded-lg text-xs font-semibold flex items-center justify-between border transition-all ${
                activeChannel === 'family'
                  ? 'bg-blue-950/40 text-blue-300 border-blue-800'
                  : 'text-slate-400 border-transparent hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span>Círculo Familiar</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Local</span>
            </button>

            <button
              onClick={() => setActiveChannel('ai')}
              className={`w-full text-left px-3.5 py-3 rounded-lg text-xs font-semibold flex items-center justify-between border transition-all ${
                activeChannel === 'ai'
                  ? 'bg-pink-950/40 text-pink-300 border-pink-800'
                  : 'text-slate-400 border-transparent hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-pink-400" />
                <span>Asistente IA (Gemini Advisor)</span>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-bounce"></span>
            </button>
          </nav>
        </div>

        {/* Channels network health visualizer */}
        <div className="bg-slate-900/60 p-3.5 rounded-lg border border-slate-800 mt-6 text-xs">
          <span className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Métricas de Enlace Local</span>
          <div className="space-y-2 font-mono text-[10px] text-slate-300">
            <div className="flex justify-between">
              <span>Velocidad Mesh:</span>
              <span className="text-emerald-400 font-semibold">240 Kbps</span>
            </div>
            <div className="flex justify-between">
              <span>Mensajes ruteados:</span>
              <span className="text-slate-400">{messages.length} pkts</span>
            </div>
            <div className="flex justify-between">
              <span>Duplicados filtrados:</span>
              <span className="text-slate-400">12</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Frame */}
      <div className="lg:col-span-3 flex flex-col justify-between h-[520px]">
        
        {/* Chat header banner */}
        <div className="p-3.5 bg-slate-850 border-b border-slate-800 flex justify-between items-center px-6">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></div>
            <h4 className="font-display font-semibold text-xs uppercase text-slate-200 tracking-wider">
              {activeChannel === 'broadcast' ? 'Canal General de Emergencia - Retransmisión Mesh Activa' :
               activeChannel === 'brigade' ? 'Comunicaciones de Brigada de Rescate' :
               activeChannel === 'family' ? 'Comunicaciones de Familiares Cercanos' :
               'Consultor de Emergencia IA (Gemini - Operación Autónoma)'}
            </h4>
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            TTL: 5 Saltos | Cripto: AES-256
          </div>
        </div>

        {/* Message logs scrolling list */}
        <div id="messages-scroller" className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-950/40">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-10">
              <MessageSquare className="w-12 h-12 text-slate-700 stroke-1 mb-2 animate-pulse" />
              <p className="text-slate-400 text-xs font-display">No hay mensajes en este canal todavía.</p>
              <p className="text-[10px] text-slate-500 max-w-xs mt-1">
                {activeChannel === 'ai' 
                  ? 'Pregúntame sobre primeros auxilios, sismos, desastres o escribe "ayuda" para recibir asistencia inmediata en español.'
                  : 'Los mensajes enviados aquí se propagarán automáticamente a los nodos vecinos dentro de tu alcance.'}
              </p>
            </div>
          ) : (
            filteredMessages.map((msg, idx) => {
              const isMe = msg.sender_name === 'Tú (Mi Nodo)';
              const isAi = msg.sender_name === 'Asistente Inteligente RedSOS';

              return (
                <div
                  key={msg.id || idx}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                >
                  {/* Sender Metadata tag */}
                  <span className="text-[9px] text-slate-400 font-semibold font-mono px-1">
                    {msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>

                  {/* Bubble content */}
                  <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs shadow ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : isAi
                      ? 'bg-pink-950/80 text-pink-100 border border-pink-800 rounded-tl-none font-sans leading-relaxed'
                      : 'bg-slate-800 text-slate-100 rounded-tl-none'
                  }`}>
                    {msg.type === 'location' ? (
                      <span className="flex items-center gap-1.5 text-blue-200">
                        <Navigation className="w-3.5 h-3.5 shrink-0 rotate-45" />
                        {msg.content}
                      </span>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>

                  {/* Packet routing details info line */}
                  <div className={`text-[8px] font-mono text-slate-500 px-1.5 flex items-center gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <span>UUID: {msg.uuid}</span>
                    <span>•</span>
                    <span>Saltos: {msg.hops}</span>
                    <span>•</span>
                    <span>TTL: {msg.ttl}</span>
                    {isMe && (
                      <span className="flex items-center gap-0.5 text-blue-400 font-semibold">
                        {msg.is_synced ? (
                          <>
                            <CheckCheck className="w-3 h-3 text-emerald-400" />
                            Sincronizado
                          </>
                        ) : (
                          <>
                            <Check className="w-3 h-3 text-slate-400" />
                            Retransmitido
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Quick presets & action toolbar */}
        <div className="px-4 py-2 bg-slate-900 border-t border-slate-800/80 flex flex-wrap gap-1.5">
          <button
            onClick={handleSendLocation}
            className="flex items-center gap-1 bg-slate-950 hover:bg-slate-800 text-blue-400 hover:text-blue-300 border border-slate-800 px-2 py-1 rounded text-[10px] font-mono transition-colors"
          >
            <Navigation className="w-3 h-3 rotate-45" /> Compartir Ubicación GPS
          </button>
          
          {quickResponses.map(resp => (
            <button
              key={resp}
              onClick={() => handleSendQuickAction(resp)}
              className="bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-300 border border-slate-800 px-2 py-1 rounded text-[10px] transition-colors"
            >
              {resp}
            </button>
          ))}
        </div>

        {/* Message Input Box Form */}
        <form onSubmit={handleSend} className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-3">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              activeChannel === 'ai' 
                ? "Pregunta al Operador IA RedSOS (Ej. ¿Qué hago en caso de sismo?)..." 
                : "Escribe tu mensaje para propagar vía red Mesh..."
            }
            className="flex-1 bg-slate-900 border border-slate-800 focus:border-emerald-700 rounded-lg py-2.5 px-4 text-xs text-slate-100 placeholder-slate-500 focus:ring-1 focus:ring-emerald-700 outline-none"
          />
          
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg p-2.5 flex items-center justify-center transition-colors shadow-lg shadow-emerald-950/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
