/**
 * RedSOS - Prompt 2: FlashlightMorseService.ts
 * Servicio para codificación de mensajes en código Morse y control de la linterna (Torch API o fallback de pantalla).
 */

const MORSE_CODE: Record<string, string> = {
  'S': '...', 'O': '---',
  'A': '.-',  'B': '-...', 'C': '-.-.', 'D': '-..',
  'E': '.',   'F': '..-.', 'G': '--.',  'H': '....',
  'I': '..',  'J': '.---', 'K': '-.-',  'L': '.-..',
  'M': '--',  'N': '-.',   'P': '.--.', 'R': '.-.',
  'T': '-',   'U': '..-',  'V': '...-', 'W': '.--',
  'Y': '-.--', 'Z': '--..',
  '1': '.----', '2': '..---', '3': '...--',
  ' ': '/'
};

// Timing estándar ITU Morse
const DOT_MS = 100;
const DASH_MS = 300;
const SYMBOL_GAP = 100;
const LETTER_GAP = 300;
const WORD_GAP = 700;

let isFlashingState = false;
let currentMessageState: string | null = null;
let currentTimeoutId: number | null = null;
let flashLoopIntervalId: number | null = null;
let videoTrack: MediaStreamTrack | null = null;
let screenFlashCallback: ((isOn: boolean) => void) | null = null;

/**
 * Registra un callback para que el UI pueda reaccionar en caso de fallback de parpadeo de pantalla
 */
export function registerScreenFlashCallback(callback: ((isOn: boolean) => void) | null): void {
  screenFlashCallback = callback;
}

/**
 * Convertir texto a secuencia Morse
 */
export function textToMorse(text: string): string {
  return text
    .toUpperCase()
    .split('')
    .map(char => MORSE_CODE[char] || '')
    .filter(code => code !== '')
    .join(' ');
}

// Auxiliar para dormir hilos
const sleep = (ms: number) => new Promise(resolve => {
  currentTimeoutId = window.setTimeout(resolve, ms);
});

async function setTorch(on: boolean): Promise<boolean> {
  // Intentar apagar/encender callback de pantalla
  if (screenFlashCallback) {
    try {
      screenFlashCallback(on);
    } catch (e) {
      console.error(e);
    }
  }

  // Intentar usar Torch API real
  if (!videoTrack) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      videoTrack = stream.getVideoTracks()[0];
    } catch (e) {
      // No soportado o denegado
      return false;
    }
  }

  if (videoTrack) {
    try {
      await videoTrack.applyConstraints({
        advanced: [{ torch: on } as Record<string, boolean>]
      } as unknown as MediaTrackConstraints);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

/**
 * Detener cualquier secuencia activa de linterna
 */
export function stopFlash(): void {
  isFlashingState = false;
  currentMessageState = null;
  if (currentTimeoutId !== null) {
    clearTimeout(currentTimeoutId);
    currentTimeoutId = null;
  }
  if (flashLoopIntervalId !== null) {
    clearInterval(flashLoopIntervalId);
    flashLoopIntervalId = null;
  }
  setTorch(false).catch(() => {});
  if (videoTrack) {
    try {
      videoTrack.stop();
    } catch (e) {}
    videoTrack = null;
  }
}

/**
 * Activar linterna en patrón Morse usando Torch API con fallbacks
 */
export async function flashMorse(text: string): Promise<void> {
  stopFlash();
  isFlashingState = true;
  currentMessageState = text;

  const morse = textToMorse(text);
  console.log(`Iniciando destellos Morse para: "${text}" (${morse})`);

  for (let i = 0; i < morse.length; i++) {
    if (!isFlashingState) break;

    const char = morse[i];
    if (char === '.') {
      await setTorch(true);
      await sleep(DOT_MS);
      await setTorch(false);
      await sleep(SYMBOL_GAP);
    } else if (char === '-') {
      await setTorch(true);
      await sleep(DASH_MS);
      await setTorch(false);
      await sleep(SYMBOL_GAP);
    } else if (char === ' ') {
      // Separación entre letras
      await sleep(LETTER_GAP);
    } else if (char === '/') {
      // Separación entre palabras
      await sleep(WORD_GAP);
    }
  }

  // Si no está configurada la repetición infinita, se apaga al finalizar
  if (currentMessageState === text) {
    stopFlash();
  }
}

/**
 * Señal SOS automática infinita hasta cancelar con pausa de 2 segundos entre repeticiones
 */
export async function startSOSFlash(): Promise<void> {
  stopFlash();
  isFlashingState = true;
  currentMessageState = "S O S";

  const runSOS = async () => {
    while (isFlashingState) {
      await flashMorse("S O S");
      if (isFlashingState) {
        await sleep(2000); // Pausa de 2 segundos entre repeticiones
      }
    }
  };

  runSOS().catch(e => {
    console.error("Error en bucle infinito SOS Morse:", e);
    stopFlash();
  });
}

/**
 * Señal de confirmación (ACK recibido): 3 destellos rápidos
 */
export async function flashACK(): Promise<void> {
  stopFlash();
  isFlashingState = true;
  currentMessageState = "ACK";

  for (let i = 0; i < 3; i++) {
    await setTorch(true);
    await sleep(80);
    await setTorch(false);
    await sleep(80);
  }
  stopFlash();
}

/**
 * Señal de peligro químico/gas: patrón especial X (-..-)
 */
export async function flashHazard(): Promise<void> {
  await flashMorse("X");
}

/**
 * Estado actual de la linterna Morse
 */
export function getFlashStatus(): {
  isFlashing: boolean;
  currentMessage: string | null;
  torchSupported: boolean;
  estimatedDurationMs: number;
} {
  const isSupported = typeof navigator !== 'undefined' && 
                       typeof navigator.mediaDevices !== 'undefined' && 
                       typeof navigator.mediaDevices.getUserMedia === 'function';

  // Calcular duración aproximada de la secuencia actual
  let duration = 0;
  if (currentMessageState) {
    const morse = textToMorse(currentMessageState);
    for (const char of morse) {
      if (char === '.') duration += DOT_MS + SYMBOL_GAP;
      else if (char === '-') duration += DASH_MS + SYMBOL_GAP;
      else if (char === ' ') duration += LETTER_GAP;
      else if (char === '/') duration += WORD_GAP;
    }
  }

  return {
    isFlashing: isFlashingState,
    currentMessage: currentMessageState,
    torchSupported: isSupported,
    estimatedDurationMs: duration
  };
}
