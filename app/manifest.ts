import type { MetadataRoute } from 'next'

/** App installabile (PWA) su PC e telefono: si apre a schermo intero, senza barra del browser. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finanze',
    short_name: 'Finanze',
    description: 'Il tuo sistema finanziario personale.',
    lang: 'it',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0b0f',
    theme_color: '#0a0b0f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
