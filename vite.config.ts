import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ mode }) => {
  // Target worker in production (replaceable placeholder) or local express in dev
  const apiTarget = mode === 'production'
    ? 'https://redsos-worker.redsos-venezuela.workers.dev'
    : 'http://localhost:3000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    // Make API target available client-side as well via import.meta.env.VITE_API_URL and VITE_WORKER_URL
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(mode === 'production' ? apiTarget : ''),
      'import.meta.env.VITE_WORKER_URL': JSON.stringify('https://redsos-worker.redsos-venezuela.workers.dev'),
    },
  };
});
