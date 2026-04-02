/**
 * sw.js — Service Worker
 * Minimercado Control-Total | JVSoftware
 * Estrategia: Cache-First para assets estáticos, Network-First para navegación
 */

const CACHE_NAME = 'minimercado-v1.0.0';
const CACHE_STATIC = 'minimercado-static-v1';
const CACHE_DYNAMIC = 'minimercado-dynamic-v1';

// Assets críticos — se cachean en la instalación
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/inventario.html',
  '/manifest.json',
  '/assets/css/main.css',
  '/assets/css/pos.css',
  '/assets/css/dashboard.css',
  '/assets/css/inventario.css',
  '/assets/css/print.css',
  '/assets/js/db.js',
  '/assets/js/pos.js',
  '/assets/js/inventario.js',
  '/assets/js/eeff.js',
  '/assets/js/backup.js',
  '/assets/js/cajero.js',
  '/assets/icons/favicon.ico',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
];

// Página de fallback offline
const OFFLINE_PAGE = '/index.html';

/* ─────────────────────────────────────────
   INSTALL — Cachear todos los assets críticos
───────────────────────────────────────── */
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Minimercado Control-Total...');

  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      console.log('[SW] Cacheando assets estáticos...');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      console.log('[SW] Assets cacheados correctamente.');
      // Forzar activación inmediata sin esperar
      return self.skipWaiting();
    }).catch((err) => {
      console.error('[SW] Error en instalación:', err);
    })
  );
});

/* ─────────────────────────────────────────
   ACTIVATE — Limpiar caches viejos
───────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando nueva versión...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_STATIC && name !== CACHE_DYNAMIC)
          .map((name) => {
            console.log('[SW] Eliminando cache obsoleto:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activado. Controlando todos los clientes.');
      // Tomar control de todas las pestañas abiertas inmediatamente
      return self.clients.claim();
    })
  );
});

/* ─────────────────────────────────────────
   FETCH — Estrategia híbrida
───────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests que no sean GET
  if (request.method !== 'GET') return;

  // Ignorar extensiones de Chrome y otros esquemas no-http
  if (!url.protocol.startsWith('http')) return;

  // Ignorar requests a Sanity o APIs externas (si se agregan en el futuro)
  if (url.hostname !== self.location.hostname) return;

  // Estrategia según tipo de recurso
  if (isStaticAsset(url.pathname)) {
    // Cache-First para CSS, JS, imágenes, fuentes
    event.respondWith(cacheFirst(request));
  } else if (isNavigation(request)) {
    // Network-First para navegación HTML
    event.respondWith(networkFirst(request));
  } else {
    // Stale-While-Revalidate para el resto
    event.respondWith(staleWhileRevalidate(request));
  }
});

/* ─────────────────────────────────────────
   Helpers de detección
───────────────────────────────────────── */
function isStaticAsset(pathname) {
  return (
    pathname.includes('/assets/css/') ||
    pathname.includes('/assets/js/') ||
    pathname.includes('/assets/icons/') ||
    pathname.includes('/assets/fonts/') ||
    pathname.includes('/assets/img/') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.woff2')
  );
}

function isNavigation(request) {
  return (
    request.mode === 'navigate' ||
    request.headers.get('accept')?.includes('text/html')
  );
}

/* ─────────────────────────────────────────
   Estrategias de caché
───────────────────────────────────────── */

// Cache-First: sirve desde caché, si no existe va a red y cachea
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('[SW] Cache-First falló para:', request.url);
    return new Response('Asset no disponible offline', { status: 503 });
  }
}

// Network-First: intenta red, si falla usa caché, si no hay caché muestra fallback
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_DYNAMIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('[SW] Offline — sirviendo desde caché:', request.url);
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback al POS si no hay nada
    const fallback = await caches.match(OFFLINE_PAGE);
    return fallback || new Response(offlineFallbackHTML(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 200,
    });
  }
}

// Stale-While-Revalidate: sirve caché inmediatamente, actualiza en segundo plano
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_DYNAMIC);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || new Response('No disponible', { status: 503 });
}

/* ─────────────────────────────────────────
   Página de fallback offline (inline)
───────────────────────────────────────── */
function offlineFallbackHTML() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sin conexión — Minimercado</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0f;
      color: #e8e8e0;
      font-family: 'Syne', system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 2rem;
    }
    .container { max-width: 400px; }
    .icon { font-size: 4rem; margin-bottom: 1.5rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.75rem; color: #a3e635; }
    p { color: #888; line-height: 1.6; margin-bottom: 1.5rem; }
    button {
      background: #a3e635;
      color: #0a0a0f;
      border: none;
      padding: 0.75rem 2rem;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    button:hover { background: #bef264; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📡</div>
    <h1>Sin conexión</h1>
    <p>El sistema necesita cargar al menos una vez con internet para funcionar offline.</p>
    <p>Verifica tu conexión y vuelve a intentarlo.</p>
    <button onclick="window.location.reload()">Reintentar</button>
  </div>
</body>
</html>`;
}

/* ─────────────────────────────────────────
   MENSAJE desde la app (ej: forzar update)
───────────────────────────────────────── */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});