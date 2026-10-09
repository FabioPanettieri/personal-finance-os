import { expect, test } from '@playwright/test'

import { seedDashboard } from '../../support/dashboard-seed'
import { admin, createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/** Sul telefono nessuna pagina è più larga dello schermo (niente zoom indietro, niente scorrimento laterale). */
const users: E2EUser[] = []
test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

const PAGES = ['/', '/transactions', '/accounts', '/business', '/investments', '/reports?kind=year', '/goals', '/imports/new', '/settings']

test('mobile: tutte le pagine stanno nello schermo', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Solo telefono')
  const user = await createUser('mobile-width')
  users.push(user)
  await seedDashboard(admin, user.id)
  await signInWithMfa(page, user, '/')
  const viewport = page.viewportSize()!.width
  for (const path of PAGES) {
    await page.goto(path)
    const [innerWidth, overflow] = await page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth - window.innerWidth])
    expect.soft(innerWidth, `${path}: larghezza`).toBe(viewport)
    expect.soft(overflow, `${path}: scorrimento laterale`).toBeLessThanOrEqual(0)
  }
  // Anche la pagina di un business e di un movimento.
  await page.goto('/business')
  await page.getByTestId('business-VOXEL Studio').getByRole('link', { name: /VOXEL Studio/ }).click()
  expect(await page.evaluate(() => window.innerWidth)).toBe(viewport)
  await page.goto('/transactions')
  await page.getByTestId('transaction-row').first().getByRole('link').click()
  expect(await page.evaluate(() => window.innerWidth)).toBe(viewport)
})
