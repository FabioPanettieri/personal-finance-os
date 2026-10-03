import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'

import type { Database } from '@/types/database'

import { msUntilNextTotpWindow, totp } from '../support/totp'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !publishableKey || !secretKey) {
  throw new Error('Stack Supabase locale non disponibile: esegui `npm run db:start` e usa `npm run test:integration`.')
}

const options = { auth: { persistSession: false, autoRefreshToken: false } }

/** Client amministrativo (secret key LOCALE): solo per preparare e verificare i test, bypassa RLS. */
export const admin = createClient<Database>(url, secretKey, options)

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(url!, publishableKey!, options)
}

export type TestUser = {
  id: string
  email: string
  password: string
  client: SupabaseClient<Database>
  totpSecret?: string
  factorId?: string
}

/** Livello di autenticazione della sessione corrente, letto dal JWT emesso da Supabase Auth. */
export async function currentAal(client: SupabaseClient<Database>): Promise<string | undefined> {
  const { data } = await client.auth.getClaims()
  return data?.claims.aal as string | undefined
}

/**
 * Verifica TOTP reale (challenge + verify). Supabase rifiuta un codice già
 * usato nella stessa finestra: in quel caso si attende la finestra successiva.
 */
export async function verifyTotp(user: TestUser, client = user.client): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: user.factorId!, code: totp(user.totpSecret!) })
    if (!error) return
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, msUntilNextTotpWindow()))
    else throw error
  }
}

/** Login email + password: sessione AAL1. */
export async function signIn(user: Pick<TestUser, 'email' | 'password'>): Promise<SupabaseClient<Database>> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password })
  if (error) throw error
  return client
}

/**
 * Utente sintetico creato dall'amministratore e autenticato tramite l'API
 * reale. Di default completa anche la configurazione TOTP (sessione AAL2),
 * come fa l'app al primo accesso.
 */
export async function createTestUser(label: string, level: 'aal1' | 'aal2' = 'aal2'): Promise<TestUser> {
  const email = `${label}-${randomUUID()}@example.test`
  const password = `Pw-${randomUUID()}`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw created.error

  const user: TestUser = { id: created.data.user.id, email, password, client: await signIn({ email, password }) }
  if (level === 'aal2') await enrollTotp(user)
  return user
}

/** Bootstrap del secondo fattore: avviene con una sessione AAL1. */
export async function enrollTotp(user: TestUser): Promise<void> {
  const { data, error } = await user.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'test' })
  if (error) throw error
  user.factorId = data.id
  user.totpSecret = data.totp.secret
  await verifyTotp(user)
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (user) await admin.auth.admin.deleteUser(user.id)
}

export function fingerprint(seed: string): string {
  return createHash('sha256').update(seed).digest('hex')
}

export async function accountId(client: SupabaseClient<Database>, name: string): Promise<string> {
  const { data, error } = await client.from('accounts').select('id').eq('name', name).single()
  if (error) throw error
  return data.id
}
