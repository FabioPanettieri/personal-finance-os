import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'

import { msUntilNextTotpWindow, totp } from '../../support/totp'

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
  await submitTotp(page, secret, 'Attiva e continua')
  await expect(page).toHaveURL(next)
}

/**
 * Inserisce il codice TOTP corrente. Supabase rifiuta un codice già usato
 * nella stessa finestra di 30 s: in quel caso attende la finestra successiva.
 */
export async function submitTotp(page: Page, secret: string, button: 'Attiva e continua' | 'Verifica') {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByLabel('Codice di verifica').fill(totp(secret))
    await page.getByRole('button', { name: button }).click()
    const outcome = await Promise.race([
      page.waitForURL((url) => !url.pathname.startsWith('/mfa/'), { timeout: 10_000 }).then(() => 'ok' as const),
      page
        .getByText('Codice non valido o scaduto.')
        .waitFor({ timeout: 10_000 })
        .then(() => 'rejected' as const),
    ])
    if (outcome === 'ok') return
    if (attempt === 0) await page.waitForTimeout(msUntilNextTotpWindow())
  }
  throw new Error('Codice TOTP rifiutato due volte')
}

export function fingerprint(seed: string): string {
  return createHash('sha256').update(seed).digest('hex')
}

export async function accountIdFor(userId: string, name: string): Promise<string> {
  const { data, error } = await admin.from('accounts').select('id').eq('user_id', userId).eq('name', name).single()
  if (error) throw error
  return data.id as string
}
