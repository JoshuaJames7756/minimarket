/**
 * sw.js — Service Worker
 * Minimercado Control-Total | JVSoftware
 * Estrategia: Network-First para CSS/JS, Cache-First para assets estáticos, Network-First para navegación
 *
 * ⚡ Para actualizar assets: solo incrementa VERSION abajo.
 */

// ─── VERSIÓN ÚNICA ────────────────────────────────────────────────────────────
const VERSION = 'v1.0.1'; // ← Solo cambia esto al actualizar assets
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME    = `minimercado-${VERSION}`;
const CACHE_STATIC  = `minimercado-static-${VERSION}`;
const CACHE_DYNAMIC = `minimercado-dynamic-${VERSION}`;

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
  console.log(`[SW] Instalando Minimercado Control-Total ${VERSION}...`);

  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      console.log('[SW] Cacheando assets estáticos...');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      console.log('[SW] Assets cacheados correctamente.');
      return self.skipWaiting();
    }).catch((err) => {
      console.error('[SW] Error en instalación:', err);
    })
  );
});

/* ─────────────────────────────────────────
   ACTIVATE — Limpiar caches de versiones anteriores
───────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activando versión ${VERSION}...`);

  // Los caches válidos para esta versión
  const VALID_CACHES = [CACHE_STATIC, CACHE_DYNAMIC];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !VALID_CACHES.includes(name))
          .map((name) => {
            console.log('[SW] Eliminando cache obsoleto:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activado. Controlando todos los clientes.');
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

  // Ignorar requests a APIs externas
  if (url.hostname !== self.location.hostname) return;

  // CSS y JS → Network-First (siempre frescos cuando hay internet)
  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Imágenes, fuentes, iconos → Cache-First (no cambian frecuentemente)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navegación HTML → Network-First
  if (isNavigation(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Resto → Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(request));
});

/* ─────────────────────────────────────────
   Helpers de detección
───────────────────────────────────────── */
function isStaticAsset(pathname) {
  return (
    pathname.includes('/assets/icons/') ||
    pathname.includes('/assets/fonts/') ||
    pathname.includes('/assets/img/') ||
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

    // Fallback al index si no hay nada cacheado
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