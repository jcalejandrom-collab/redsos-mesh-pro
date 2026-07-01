import { Capacitor } from '@capacitor/core';

// Patrón de vibración para SOS recibido en código Morse: S-O-S (· · · — — — · · ·)
export function vibrateSOSPattern(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([300, 100, 300, 100, 300, 500, 700, 100, 700, 100, 700, 500, 300, 100, 300, 100, 300]);
  }
}

// Sonido de alerta usando Web Audio API (generado por código sin archivos externos)
export function playSOSAlert(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn('[AlertSound] Web Audio API no está soportada en este navegador');
      return;
    }
    
    const ctx = new AudioContextClass();
    
    // Generar tono de alerta: pitidos con decaimiento exponencial
    const playBeep = (startTime: number, duration: number, frequency: number = 880) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.8, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    
    const now = ctx.currentTime;
    
    // 3 pitidos cortos (S en Morse)
    playBeep(now, 0.2, 880);
    playBeep(now + 0.3, 0.2, 880);
    playBeep(now + 0.6, 0.2, 880);
    
    // 3 pitidos largos (O en Morse) con tono más grave (660 Hz)
    playBeep(now + 1.2, 0.6, 660);
    playBeep(now + 2.0, 0.6, 660);
    playBeep(now + 2.8, 0.6, 660);
    
    // 3 pitidos cortos (S en Morse) de nuevo
    playBeep(now + 3.6, 0.2, 880);
    playBeep(now + 3.9, 0.2, 880);
    playBeep(now + 4.2, 0.2, 880);
    
  } catch (error) {
    console.error('[AlertSound] Error reproduciendo alerta:', error);
  }
}

// Activar vibración + sonido juntos
export function triggerSOSAlert(): void {
  vibrateSOSPattern();
  playSOSAlert();
}

// Para Capacitor (app nativa) — usar LocalNotifications para sonido en background
export async function triggerNativeAlert(alertData: {
  title: string;
  body: string;
  alertId: string;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    triggerSOSAlert();
    return;
  }
  
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 100000),
        title: alertData.title,
        body: alertData.body,
        sound: 'default',
        extra: { alertId: alertData.alertId },
        smallIcon: 'ic_stat_icon_config_sample',
        iconColor: '#ef4444'
      }]
    });
  } catch (error) {
    console.error('[AlertSound] Error en LocalNotifications nativas, recurriendo a web API:', error);
    // Fallback a Web Audio si LocalNotifications falla
    triggerSOSAlert();
  }
}
