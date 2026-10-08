import type { NextConfig } from 'next'

/**
 * Header di sicurezza statici. La Content-Security-Policy è dinamica (nonce
 * per richiesta) e viene impostata in proxy.ts.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig: NextConfig = {
  // Build separata per i test E2E (puntano a un finto Supabase): non tocca .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  experimental: {
    // CSV fino a 10 MB (limite del bucket) + margine per il multipart.
    // allowedOrigins: l'app si apre anche dal nome Tailscale del PC
    // (https://<pc>.<tailnet>.ts.net, via `tailscale serve`), mai da Internet.
    serverActions: { bodySizeLimit: '11mb', allowedOrigins: ['*.ts.net'] },
    proxyClientMaxBodySize: '11mb',
  },
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
