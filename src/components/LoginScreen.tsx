import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { googleSignIn } from '../utils/firebase';
import Logo from './Logo';
import { ShieldAlert, RefreshCw, AlertTriangle, LogIn } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: any, token: string | null) => void;
  onEmergencyGuest: () => void;
}

export default function LoginScreen({ onLoginSuccess, onEmergencyGuest }: LoginScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        onLoginSuccess(result.user, result.accessToken);
      } else {
        throw new Error('No se pudo obtener información del usuario.');
      }
    } catch (err: any) {
      console.error('[Login] Error during sign in:', err);
      setError(err?.message || 'Error al iniciar sesión con Google. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#090d16] text-white p-4 relative overflow-hidden">
      {/* Background visual effect: Subtle red alert grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ef444405_1px,transparent_1px),linear-gradient(to_bottom,#ef444405_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-600/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md z-10 bg-slate-900/60 backdrop-blur-xl rounded-3xl border border-slate-800 p-8 shadow-2xl flex flex-col items-center"
      >
        <Logo size="lg" showText={true} />

        <div className="mt-6 text-center">
          <h2 className="text-xl font-bold tracking-tight text-white font-sans">
            Sistema de Emergencias Venezuela
          </h2>
          <p className="text-slate-400 text-xs mt-1 font-mono tracking-wider">
            SOPORTE COOPERATIVO DE RESCATE
          </p>
        </div>

        {/* Info alerts if offline */}
        {isOffline && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 w-full flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-300 text-xs"
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Sin conexión a Internet</p>
              <p className="opacity-80">El inicio de sesión de Google requiere conectividad.</p>
            </div>
          </motion.div>
        )}

        {/* Error message displays */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 w-full flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-xs"
          >
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Fallo en la Autenticación</p>
              <p className="opacity-80">{error}</p>
            </div>
          </motion.div>
        )}

        <div className="mt-8 w-full space-y-4">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading || isOffline}
            className={`w-full py-4 px-6 rounded-2xl flex items-center justify-center gap-3 font-semibold transition-all duration-300 ${
              loading || isOffline
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] border border-red-500/30 cursor-pointer active:scale-[0.98]'
            }`}
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <LogIn className="w-5 h-5" />
            )}
            <span>
              {loading ? 'Autenticando...' : 'Iniciar sesión con Google'}
            </span>
          </button>

          {/* CRITICAL: Secondary emergency bypass option */}
          <button
            onClick={onEmergencyGuest}
            disabled={loading}
            className="w-full py-3 px-6 rounded-2xl bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 transition-all duration-300 font-medium text-sm text-center flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <span>Emergencia sin cuenta</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-500 text-center mt-8 font-sans leading-relaxed border-t border-slate-800/80 pt-4 w-full">
          Tu cuenta identifica tu ubicación y credenciales ante las brigadas de rescate para coordinar la ayuda de forma segura y eficiente.
        </p>
      </motion.div>
    </div>
  );
}
