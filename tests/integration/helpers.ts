import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'

import type { Database } from '@/types/database'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !publishableKey || !secretKey) {
  throw new Error('Stack Supabase locale non disponibile: esegui `npm run db:start` e usa `npm run test:integration`.')
}

const options = { auth: { persistSession: false, autoRefreshToken: false } }

/** Client amministrativo: SOLO per creare/cancellare gli utenti di test. */
export const admin = createClient<Database>(url, secretKey, options)

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(url!, publishableKey!, options)
}

export type TestUser = { id: string; email: string; client: SupabaseClient<Database> }

/** Utente sintetico, autenticato con email e password tramite l'API reale. */
export async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID()}@example.test`
  const password = `Pw-${randomUUID()}`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw created.error

  const client = anonClient()
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error) throw signedIn.error
  return { id: created.data.user.id, email, client }
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
