// =============================================================================
// Finto Supabase (Auth + una tabella REST) SOLO per i test E2E.
//
// Implementa il minimo dell'API GoTrue usata dall'app — password login,
// refresh, utente, enroll/challenge/verify TOTP, logout — con JWT HS256 veri,
// così il codice reale (@supabase/ssr, getClaims, proxy, layout) gira
// end-to-end senza un progetto Supabase. Nessun dato reale: un solo utente
// fittizio, stato in memoria.
// =============================================================================

import { createHmac, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54399)
const SECRET = 'e2e-only-not-a-real-secret'
export const TEST_USER = { email: 'owner@example.test', password: 'correct-horse-battery', totp: '123456' }

const USER_ID = '00000000-0000-4000-8000-000000000001'

let state
function reset() {
  state = { factors: [], refreshTokens: new Map(), challenges: new Map() }
}
reset()

const b64url = (input) => Buffer.from(input).toString('base64url')

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const signature = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

function verifyJwt(token) {
  const [header, body, signature] = (token ?? '').split('.')
  if (!header || !body || !signature) return null
  const expected = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
  if (expected !== signature) return null
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
  if (payload.exp * 1000 < Date.now()) return null
  return payload
}

function user() {
  return {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: TEST_USER.email,
    email_confirmed_at: '2026-10-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    factors: state.factors,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  }
}

function session(aal) {
  const now = Math.floor(Date.now() / 1000)
  const expiresIn = 3600
  const refreshToken = randomUUID()
  state.refreshTokens.set(refreshToken, aal)
  const access_token = signJwt({
    sub: USER_ID,
    email: TEST_USER.email,
    aud: 'authenticated',
    role: 'authenticated',
    aal,
    amr: [{ method: aal === 'aal2' ? 'totp' : 'password', timestamp: now }],
    session_id: randomUUID(),
    iat: now,
    exp: now + expiresIn,
    iss: `http://127.0.0.1:${PORT}/auth/v1`,
  })
  return {
    access_token,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: now + expiresIn,
    refresh_token: refreshToken,
    user: user(),
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

const authError = (res, status, code, msg) => send(res, status, { code, error_code: code, msg, message: msg })

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString()
  return raw ? JSON.parse(raw) : {}
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const bearer = req.headers.authorization?.replace(/^Bearer /, '')
  const claims = verifyJwt(bearer)

  try {
    if (path === '/__health') return send(res, 200, { ok: true })

    if (req.method === 'POST' && path === '/__reset') {
      reset()
      return send(res, 200, { ok: true })
    }

    if (req.method === 'POST' && path === '/auth/v1/token') {
      const body = await readBody(req)
      const grant = url.searchParams.get('grant_type')
      if (grant === 'password') {
        if (body.email !== TEST_USER.email || body.password !== TEST_USER.password) {
          return authError(res, 400, 'invalid_credentials', 'Invalid login credentials')
        }
        return send(res, 200, session('aal1'))
      }
      if (grant === 'refresh_token') {
        const aal = state.refreshTokens.get(body.refresh_token)
        if (!aal) return authError(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token')
        state.refreshTokens.delete(body.refresh_token)
        return send(res, 200, session(aal))
      }
      return authError(res, 400, 'unsupported_grant_type', 'unsupported grant')
    }

    if (path.startsWith('/auth/v1/') && path !== '/auth/v1/token' && !claims) {
      return authError(res, 401, 'bad_jwt', 'invalid JWT')
    }

    if (req.method === 'GET' && path === '/auth/v1/user') return send(res, 200, user())

    if (req.method === 'POST' && path === '/auth/v1/logout') {
      state.refreshTokens.clear()
      res.writeHead(204)
      return res.end()
    }

    if (req.method === 'POST' && path === '/auth/v1/factors') {
      const body = await readBody(req)
      const factor = {
        id: randomUUID(),
        factor_type: body.factor_type,
        friendly_name: body.friendly_name,
        status: 'unverified',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      state.factors.push(factor)
      return send(res, 200, {
        id: factor.id,
        type: 'totp',
        friendly_name: factor.friendly_name,
        totp: {
          qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="176" height="176"><rect width="176" height="176" fill="#000"/></svg>',
          secret: 'JBSWY3DPEHPK3PXP',
          uri: 'otpauth://totp/e2e',
        },
      })
    }

    const factorMatch = /^\/auth\/v1\/factors\/([^/]+)(?:\/(challenge|verify))?$/.exec(path)
    if (factorMatch) {
      const [, factorId, action] = factorMatch
      const factor = state.factors.find((f) => f.id === factorId)
      if (!factor) return authError(res, 404, 'mfa_factor_not_found', 'Factor not found')

      if (req.method === 'DELETE' && !action) {
        state.factors = state.factors.filter((f) => f.id !== factorId)
        return send(res, 200, { id: factorId })
      }
      if (req.method === 'POST' && action === 'challenge') {
        const id = randomUUID()
        state.challenges.set(id, factorId)
        return send(res, 200, { id, type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 })
      }
      if (req.method === 'POST' && action === 'verify') {
        const body = await readBody(req)
        if (state.challenges.get(body.challenge_id) !== factorId || body.code !== TEST_USER.totp) {
          return authError(res, 422, 'mfa_verification_failed', 'Invalid TOTP code entered')
        }
        state.challenges.delete(body.challenge_id)
        factor.status = 'verified'
        return send(res, 200, session('aal2'))
      }
    }

    // PostgREST: solo la lettura del profilo, con RLS simulata (claim sub).
    if (req.method === 'GET' && path === '/rest/v1/profiles') {
      if (!claims) return send(res, 401, { message: 'JWT required' })
      const row = { id: USER_ID, display_name: 'Utente Demo', base_currency: 'EUR', locale: 'it-IT', timezone: 'Europe/Rome' }
      const single = (req.headers.accept ?? '').includes('vnd.pgrst.object')
      return send(res, 200, single ? row : [row])
    }

    // Conti: nessun conto (stato vuoto). I conti reali si testano in tests/e2e/local.
    if (req.method === 'GET' && (path === '/rest/v1/accounts' || path === '/rest/v1/account_balances')) {
      if (!claims) return send(res, 401, { message: 'JWT required' })
      return send(res, 200, [])
    }

    return send(res, 404, { message: `mock: ${req.method} ${path} non implementato` })
  } catch (error) {
    return send(res, 500, { message: String(error) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock-supabase in ascolto su http://127.0.0.1:${PORT}`)
})
