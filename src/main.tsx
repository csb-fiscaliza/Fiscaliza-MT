import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Registro resiliente do Service Worker para suporte PWA offline em campo
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[PWA] Service Worker não registrado (esperado em ambiente de desenvolvimento sandboxed):', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
