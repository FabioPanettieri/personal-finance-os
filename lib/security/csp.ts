/**
 * Content Security Policy con nonce per richiesta (docs/02-security.md).
 *
 * - script: solo con nonce + 'strict-dynamic' (Next.js applica il nonce ai
 *   propri script leggendo l'header della richiesta);
 * - style: 'unsafe-inline' è necessario per gli attributi style di React e
 *   Next.js; il rischio è contenuto perché gli script restano bloccati;
 * - connect: solo l'origine del progetto Supabase (più websocket realtime).
 */
export function buildContentSecurityPolicy(options: {
  nonce: string
  isDev: boolean
  supabaseUrl: string | null
}): string {
  const { nonce, isDev, supabaseUrl } = options

  const connect = ["'self'"]
  if (supabaseUrl) {
    const origin = new URL(supabaseUrl).origin
    connect.push(origin, origin.replace(/^http/, 'ws'))
  }
  if (isDev) connect.push('ws:')

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'blob:', 'data:'],
    'font-src': ["'self'"],
    'connect-src': connect,
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
  }

  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`)
  if (!isDev) policy.push('upgrade-insecure-requests')
  return policy.join('; ')
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}
