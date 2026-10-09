import { expect, test } from '@playwright/test'

import { seedDashboard } from '../../support/dashboard-seed'
import { admin, createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/** Sprint 7: personale vs business e dettaglio di un'attività (dati sintetici, settembre 2026). */
const users: E2EUser[] = []
test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

const euro = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(cents / 100)

test('business: personale e business separati, dettaglio con grafico', async ({ page }, testInfo) => {
  const user = await createUser('business')
  users.push(user)
  await seedDashboard(admin, user.id)
  await signInWithMfa(page, user, '/business?period=custom&from=2026-09-01&to=2026-09-30')

  await expect(page.getByTestId('split-business')).toContainText(euro(36500))
  await expect(page.getByTestId('split-business')).toContainText(euro(1250))
  await expect(page.getByTestId('split-total')).toContainText(euro(201500))
  await page.screenshot({ path: `tests/e2e/screenshots/local-business-${testInfo.project.name}.png`, fullPage: true })

  await page.getByTestId('business-VOXEL Studio').getByRole('link', { name: /VOXEL Studio/ }).click()
  await expect(page.getByRole('heading', { name: 'VOXEL Studio', level: 1 })).toBeVisible()
  await page.goto(page.url().split('?')[0] + '?period=custom&from=2026-09-01&to=2026-09-30')
  await expect(page.getByTestId('business-hero')).toContainText(euro(10750))
  await expect(page.getByTestId('business-hero')).toContainText('89,6%')
  await expect(page.getByRole('img', { name: /Incassi e spese di VOXEL Studio/ })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Movimenti del business' }).getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('list', { name: 'Spese per categoria' })).toContainText('Business')
  await page.screenshot({ path: `tests/e2e/screenshots/local-business-detail-${testInfo.project.name}.png`, fullPage: true })
})
