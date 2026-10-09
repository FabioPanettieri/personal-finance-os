// Service worker di Finanze (docs/00-architecture.md, "PWA").
// Privacy: NON salva mai pagine o dati finanziari. Tiene in cache solo
// - la pagina offline (mostrata se il PC con Finanze è spento o irraggiungibile);
// - i file statici con hash nel nome (/_next/static), che non contengono dati.
const VERSION = 'v1'
const STATIC_CACHE = `finanze-static-${VERSION}`
const OFFLINE_URL = '/offline.html'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('finanze-') && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function offline(fallback) {
  return (await caches.match(OFFLINE_URL)) ?? fallback ?? Response.error()
}

/** Dopo molti aggiornamenti i vecchi file si accumulano: ne tiene al massimo 200 (più la pagina offline). */
async function trim(cache) {
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith('/_next/static/'))
  for (const old of keys.slice(0, Math.max(0, keys.length - 200))) await cache.delete(old)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Pagine: sempre dalla rete (dati sempre aggiornati); senza rete, la pagina offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        // 502/503/504: il telefono raggiunge il PC (Tailscale) ma Finanze è spenta.
        .then((response) => (response.status >= 502 && response.status <= 504 ? offline(response) : response))
        .catch(() => offline()),
    )
    return
  }

  // File statici con hash: non cambiano mai, si possono riusare (avvio più rapido).
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) {
          await cache.put(request, response.clone())
          trim(cache)
        }
        return response
      }),
    )
  }
  // Tutto il resto (dati, azioni, API): solo rete, nessuna cache.
})
