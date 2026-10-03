import { expect, test } from '@playwright/test'

import { createUser, deleteUser, signInWithMfa, submitTotp, type E2EUser } from './support'

/**
 * Autenticazione reale su Supabase Auth locale, con le policy AAL2 attive:
 * il percorso TOTP deve restare completabile partendo da una sessione AAL1.
 */
const users: E2EUser[] = []

test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

test('login → TOTP obbligatorio → dati; persistenza; logout; nuovo login con verifica', async ({ page, context }) => {
  const user = await createUser('auth')
  users.push(user)

  // Solo password (AAL1): nessuna pagina con dati raggiungibile.
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL(/\/mfa\/setup$/)
  for (const path of ['/accounts', '/net-worth', '/settings/security']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/mfa\/setup/)
  }

  // Bootstrap del secondo fattore con sessione AAL1, poi accesso ai conti (AAL2).
  await context.clearCookies()
  await signInWithMfa(page, user, '/accounts')
  await expect(page.getByRole('list', { name: 'Conti attivi' }).getByRole('listitem')).toHaveCount(5)

  // Persistenza della sessione.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Conti', level: 1 })).toBeVisible()

  // Logout.
  await page.goto('/settings/security')
  await page.getByRole('main').getByRole('button', { name: 'Esci' }).click()
  await expect(page).toHaveURL('/login')
  await page.goto('/accounts')
  await expect(page).toHaveURL(/\/login/)

  // Nuovo login: fattore già configurato → verifica del codice.
  await page.goto('/login?next=%2Faccounts')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL(/\/mfa\/verify/)
  await submitTotp(page, user.totpSecret!, 'Verifica')
  await expect(page).toHaveURL('/accounts')
  await expect(page.getByRole('list', { name: 'Conti attivi' }).getByRole('listitem')).toHaveCount(5)
})
