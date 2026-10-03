import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash, createHmac, randomUUID } from 'node:crypto'

/**
 * Supporto per gli E2E contro lo stack Supabase locale reale. Utenti e dati
 * sono sintetici, creati con la secret key LOCALE solo per preparare i test.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const secretKey = process.env.SUPABASE_SECRET_KEY!

export const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

export type E2EUser = { id: string; email: string; password: string; totpSecret?: string }

export async function createUser(label: string): Promise<E2EUser> {
  const email = `e2e-${label}-${randomUUID()}@example.test`
  const password = `Pw-${randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return { id: data.user.id, email, password }
}

export async function deleteUser(user: E2EUser | undefined) {
  if (user) await admin.auth.admin.deleteUser(user.id)
}

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const value = alphabet.indexOf(char)
    if (value < 0) throw new Error(`Carattere base32 non valido: ${char}`)
    bits += value.toString(2).padStart(5, '0')
  }
  const bytes = bits.match(/.{8}/g) ?? []
  return Buffer.from(bytes.map((b) => parseInt(b, 2)))
}

/** Codice TOTP (RFC 6238: SHA-1, 30 s, 6 cifre), come un'app di autenticazione. */
export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1]! & 0x0f
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, '0')
}

/** Login reale + configurazione TOTP obbligatoria al primo accesso. */
export async function signInWithMfa(page: Page, user: E2EUser, next = '/') {
  await page.goto(next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Accedi' }).click()

  await expect(page).toHaveURL(/\/mfa\/setup/)
  await page.getByRole('button', { name: /Configura l’app di autenticazione/ }).click()
  const secret = (await page.locator('code.select-all').textContent())!.trim()
  user.totpSecret = secret
  await page.getByLabel('Codice di verifica').fill(totp(secret))
  await page.getByRole('button', { name: 'Attiva e continua' }).click()
  await expect(page).toHaveURL(next)
}

export function fingerprint(seed: string): string {
  return createHash('sha256').update(seed).digest('hex')
}

export async function accountIdFor(userId: string, name: string): Promise<string> {
  const { data, error } = await admin.from('accounts').select('id').eq('user_id', userId).eq('name', name).single()
  if (error) throw error
  return data.id as string
}
