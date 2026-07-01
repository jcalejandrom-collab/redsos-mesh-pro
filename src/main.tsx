import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registrar Service Worker para permitir notificaciones push y caching offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[ServiceWorker] Registrado con éxito:', reg.scope);
      })
      .catch((err) => {
        console.error('[ServiceWorker] Falló el registro:', err);
      });
  });
}

