// Service Worker - Fiscaliza CSB/SEMA-MT
// Suporte a operação 100% offline em campo em áreas sem sinal de celular

const CACHE_NAME = 'fiscaliza-csb-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/fiscaliza_logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Falha em cache inicial não-crítico:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Ignora requisições de API de backend/supabase ou não-GET
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Ignora requisições de hot-reload ou extensões
  if (url.protocol.startsWith('chrome') || url.pathname.includes('/@vite')) return;

  // Estratégia Network First com Fallback para Cache para navegação e dados
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Se a resposta for válida, armazena uma cópia em cache (para fontes, imagens, assets)
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
        }
        return response;
      })
      .catch(async () => {
        // Offline: tenta recuperar do cache local
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Se for navegação de página HTML, retorna a página inicial em cache
        if (event.request.headers.get('accept')?.includes('text/html')) {
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
        }
        return new Response('Sem conexão à internet. Modo offline do Fiscaliza ativo.', {
          status: 503,
          statusText: 'Service Unavailable (Offline)'
        });
      })
  );
});
