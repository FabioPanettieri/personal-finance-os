'use client'

import { useEffect } from 'react'

/**
 * Registra public/sw.js (solo nella build di produzione): pagina offline quando
 * il PC è spento e file statici in cache. Nessun dato finanziario in cache.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Senza service worker l'app funziona lo stesso: manca solo la pagina offline.
    })
  }, [])
  return null
}
