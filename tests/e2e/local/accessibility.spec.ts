import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { seedDashboard } from '../../support/dashboard-seed'
import { admin, createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/**
 * Accessibilità (WCAG 2.1 AA) con axe su tutte le pagine, con dati, in tema
 * scuro e chiaro; più la PWA: service worker attivo e pagina offline.
 */
const users: E2EUser[] = []
test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

const PAGES = [
  '/',
  '/transactions',
  '/transactions?status=review',
  '/accounts',
  '/business',
  '/investments',
  '/reports',
  '/goals',
  '/rules',
  '/imports',
  '/imports/new',
  '/settings',
  '/settings/profile',
  '/settings/backup',
  '/settings/security',
]

async function audit(page: Page, label: string) {
  // Aspetta la fine dell'animazione di ingresso (opacità) prima di misurare i contrasti.
  await page.waitForTimeout(350)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => `${n.target.join(' ')} → ${n.any[0]?.message ?? n.failureSummary ?? ''}`).slice(0, 4).join(' | ')}`)
  expect.soft(summary, `${label}: violazioni di accessibilità`).toEqual([])
}

test('accessibilità: login senza violazioni', async ({ page }) => {
  await page.goto('/login')
  await audit(page, '/login')
})

test('accessibilità: tutte le pagine, tema scuro e chiaro', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Una passata basta: stesse pagine, le regole non dipendono dalla larghezza')
  test.setTimeout(180_000)
  const user = await createUser('a11y')
  users.push(user)
  await seedDashboard(admin, user.id)
  await signInWithMfa(page, user, '/')
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((t) => localStorage.setItem('pfos-theme', t), theme)
    for (const path of PAGES) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await audit(page, `${path} (${theme})`)
    }
    // Dettaglio di un conto e di un business (card colorate e cliccabili).
    await page.goto('/accounts')
    await page.getByRole('list', { name: 'Conti attivi' }).getByRole('link').first().click()
    await expect(page.getByTestId('tile-income')).toBeVisible()
    await audit(page, `dettaglio conto (${theme})`)
    await page.goto('/business')
    await page.getByTestId('business-VOXEL Studio').getByRole('link', { name: /VOXEL Studio/ }).click()
    await audit(page, `dettaglio business (${theme})`)
  }
})

test('PWA: service worker attivo e pagina offline quando Finanze non è raggiungibile', async ({ page, context }) => {
  await page.goto('/login')
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(new URL(scope).pathname).toBe('/')
  // Il manifest dichiara l'app installabile.
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/' })

  // Dopo il primo caricamento il service worker controlla la pagina (clients.claim).
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await page.waitForFunction(async () => (await caches.match('/offline.html')) !== undefined)
  await context.setOffline(true)
  await page.goto('/').catch(() => {})
  await expect(page.getByRole('heading', { name: 'Finanze non è raggiungibile' })).toBeVisible()
  // Nessuna pagina con dati in cache: solo la pagina offline e i file statici.
  const cached = await page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(new URL(r.url).pathname)
    return urls
  })
  expect(cached.every((p) => p === '/offline.html' || p.startsWith('/icons/') || p.startsWith('/_next/static/'))).toBe(true)
  await context.setOffline(false)
})
