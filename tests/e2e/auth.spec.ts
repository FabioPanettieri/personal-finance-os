import { expect, test, type Page } from '@playwright/test'

/** Credenziali fittizie del finto Supabase (tests/e2e/mock-supabase.mjs). */
const USER = { email: 'owner@example.test', password: 'correct-horse-battery', totp: '123456' }
const MOCK = 'http://127.0.0.1:54399'

const cspViolations: string[] = []

test.beforeEach(async ({ page, request }) => {
  await request.post(`${MOCK}/__reset`)
  cspViolations.length = 0
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
      cspViolations.push(message.text())
    }
  })
})

test.afterEach(() => {
  expect(cspViolations, 'nessuna violazione CSP').toEqual([])
})

async function login(page: Page, password = USER.password) {
  await page.getByLabel('Email').fill(USER.email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Accedi' }).click()
}

async function enrollTotp(page: Page) {
  await expect(page).toHaveURL(/\/mfa\/setup$/)
  await page.getByRole('button', { name: /Configura l’app di autenticazione/ }).click()
  await expect(page.getByRole('img', { name: /Codice QR/ })).toBeVisible()
  await page.getByLabel('Codice di verifica').fill(USER.totp)
  await page.getByRole('button', { name: 'Attiva e continua' }).click()
}

test('route protette: senza sessione si finisce al login, con la destinazione conservata', async ({ page }) => {
  const response = await page.goto('/transactions')
  await expect(page).toHaveURL('/login?next=%2Ftransactions')
  await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible()

  const headers = response!.headers()
  expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/)
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
  expect(headers['x-powered-by']).toBeUndefined()

  for (const path of ['/', '/settings/security', '/mfa/setup']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login/)
  }
})

test('nessuna pagina di registrazione pubblica', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('La registrazione pubblica è disattivata.')).toBeVisible()
  await expect(page.getByRole('link', { name: /registr|sign ?up/i })).toHaveCount(0)
  // /signup non esiste: senza sessione il proxy porta comunque al login.
  await page.goto('/signup')
  await expect(page).toHaveURL(/\/login/)
})

test('credenziali errate: messaggio generico, nessun accesso', async ({ page }) => {
  await page.goto('/login')
  await login(page, 'password-sbagliata')
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Email o password non corretti.')
  await expect(page).toHaveURL(/\/login/)
})

test('validazione lato server del form di login', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('non-una-email')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page.getByText('Inserisci un indirizzo email valido')).toBeVisible()
  await expect(page.getByText('Inserisci la password')).toBeVisible()
})

test('primo accesso: login → configurazione TOTP obbligatoria → dashboard, sessione persistente, logout', async ({ page, context }) => {
  await page.goto('/')
  await login(page)

  // AAL1: l'area app non è raggiungibile finché il TOTP non è configurato.
  await expect(page).toHaveURL(/\/mfa\/setup$/)
  await page.goto('/transactions')
  await expect(page).toHaveURL(/\/mfa\/setup$/)

  await page.getByRole('button', { name: /Configura l’app di autenticazione/ }).click()
  await page.getByLabel('Codice di verifica').fill('000000')
  await page.getByRole('button', { name: 'Attiva e continua' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Codice non valido o scaduto.')

  await page.getByLabel('Codice di verifica').fill(USER.totp)
  await page.getByRole('button', { name: 'Attiva e continua' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible()
  await expect(page.getByText('Patrimonio totale')).toBeVisible()

  // Persistenza: ricarica e nuova scheda restano autenticate.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible()
  const secondTab = await context.newPage()
  await secondTab.goto('/settings/security')
  await expect(secondTab.getByRole('main').getByText(USER.email)).toBeVisible()
  await secondTab.close()

  // Sessione completa: il login rimanda alla Home.
  await page.goto('/login')
  await expect(page).toHaveURL('/')

  // Logout.
  await page.goto('/settings/security')
  await page.getByRole('main').getByRole('button', { name: 'Esci' }).click()
  await expect(page).toHaveURL('/login')
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('accesso successivo: con TOTP già attivo viene chiesto il codice', async ({ page }) => {
  await page.goto('/login')
  await login(page)
  await enrollTotp(page)
  await expect(page).toHaveURL('/')
  await page.getByRole('button', { name: 'Esci' }).first().click()
  await expect(page).toHaveURL('/login')

  await login(page)
  await expect(page).toHaveURL(/\/mfa\/verify$/)
  await page.goto('/mfa/setup')
  await expect(page).toHaveURL(/\/mfa\/verify$/)
  await page.getByLabel('Codice di verifica').fill(USER.totp)
  await page.getByRole('button', { name: 'Verifica' }).click()
  await expect(page).toHaveURL('/')
})

test('la destinazione richiesta prima del login sopravvive al passaggio MFA', async ({ page }) => {
  await page.goto('/goals')
  await expect(page).toHaveURL('/login?next=%2Fgoals')
  await login(page)
  await expect(page).toHaveURL('/mfa/setup?next=%2Fgoals')
  await page.getByRole('button', { name: /Configura l’app di autenticazione/ }).click()
  await page.getByLabel('Codice di verifica').fill(USER.totp)
  await page.getByRole('button', { name: 'Attiva e continua' }).click()
  await expect(page).toHaveURL('/goals')
  await expect(page.getByRole('heading', { name: 'Obiettivi', level: 1 })).toBeVisible()
})

test('open redirect bloccato: next esterno ignorato', async ({ page }) => {
  await page.goto('/login?next=%2F%2Fevil.example')
  await login(page)
  await expect(page).toHaveURL(/\/mfa\/setup$/)
})
