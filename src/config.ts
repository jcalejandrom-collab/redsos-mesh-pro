// Configuración global del API de RedSOS Mesh

export const WORKER_URL = (import.meta as any).env.VITE_WORKER_URL || 'https://redsos-worker.redsos-venezuela.workers.dev';
export const API_URL = (import.meta as any).env.VITE_API_URL || WORKER_URL;

console.log(`[Config] Inicializado con WORKER_URL: ${WORKER_URL} y API_URL: ${API_URL}`);
