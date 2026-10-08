import { expect, test } from '@playwright/test'

const USER = { email: 'owner@example.test', password: 'correct-horse-battery', totp: '123456' }
const MOCK = 'http://127.0.0.1:54399'

const PAGES = [
  { path: '/', heading: /^Buon(giorno|asera| pomeriggio)/ },
  { path: '/transactions', heading: 'Movimenti' },
  { path: '/settings', heading: 'Impostazioni' },
  { path: '/accounts', heading: 'Conti' },
  { path: '/business', heading: 'Business' },
  { path: '/imports', heading: 'Importazioni' },
  { path: '/imports/new', heading: 'Importa un estratto' },
  { path: '/settings/security', heading: 'Sicurezza' },
]

test.beforeEach(async ({ page, request }) => {
  await request.post(`${MOCK}/__reset`)
  await page.goto('/login')
  await page.getByLabel('Email').fill(USER.email)
  await page.getByLabel('Password').fill(USER.password)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await page.getByRole('button', { name: /Configura l’app di autenticazione/ }).click()
  await page.getByLabel('Codice di verifica').fill(USER.totp)
  await page.getByRole('button', { name: 'Attiva e continua' }).click()
  await expect(page).toHaveURL('/')
})

test('tutte le route iniziali si aprono senza errori', async ({ page }) => {
  for (const { path, heading } of PAGES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  }
})

test('navigazione: sidebar su desktop, bottom nav su mobile', async ({ page, isMobile }, testInfo) => {
  const sidebar = page.locator('aside')
  const bottomNav = page.locator('nav[aria-label="Navigazione principale"]').last()

  if (isMobile) {
    await expect(sidebar).toBeHidden()
    await expect(bottomNav).toBeVisible()
    await expect(bottomNav.getByRole('link')).toHaveCount(5)
    await bottomNav.getByRole('link', { name: 'Movimenti' }).click()
    await expect(page).toHaveURL('/transactions')
    await expect(bottomNav.getByRole('link', { name: 'Movimenti' })).toHaveAttribute('aria-current', 'page')
    // Target touch ≥ 44 px (docs/03-design-system.md).
    const box = await bottomNav.getByRole('link', { name: 'Home' }).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  } else {
    await expect(sidebar).toBeVisible()
    await expect(page.locator('nav.lg\\:hidden')).toBeHidden()
    await sidebar.getByRole('link', { name: 'Conti' }).click()
    await expect(page).toHaveURL('/accounts')
    await expect(sidebar.getByRole('link', { name: 'Conti' })).toHaveAttribute('aria-current', 'page')
  }

  // Nessuno scroll orizzontale.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  await page.goto('/')
  await page.screenshot({ path: `tests/e2e/screenshots/mock-home-${testInfo.project.name}-light.png`, fullPage: true })
})

test('tema: scuro di default, scelta persistente', async ({ page }, testInfo) => {
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'dark')

  // scuro → automatico (sistema chiaro nel test) → chiaro, poi ricarica
  const toggle = page.getByRole('button', { name: /^Tema:/ }).first()
  await toggle.click()
  await toggle.click()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.screenshot({ path: `tests/e2e/screenshots/mock-home-${testInfo.project.name}-dark.png`, fullPage: true })
})

test('conti: stato vuoto se il database non restituisce conti', async ({ page }) => {
  await page.goto('/accounts')
  await expect(page.getByRole('heading', { name: 'Nessun conto' })).toBeVisible()
  await page.goto('/accounts/00000000-0000-4000-8000-000000000999')
  await expect(page.getByRole('heading', { name: 'Conto non trovato' })).toBeVisible()
  await page.goto('/accounts/non-un-uuid')
  await expect(page.getByRole('heading', { name: 'Conto non trovato' })).toBeVisible()
})
