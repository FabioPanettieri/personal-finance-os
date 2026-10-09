import { expect, test } from '@playwright/test'

import { EXPECTED, seedDashboard } from '../../support/dashboard-seed'
import { admin, createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/** Sprint 9: report di mese e anno (dati sintetici, settembre 2026). */
const users: E2EUser[] = []
test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

const euro = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(cents / 100)

test('report: mese con osservazioni, frecce, anno con confronto e storico', async ({ page }, testInfo) => {
  const user = await createUser('reports')
  users.push(user)
  await seedDashboard(admin, user.id)
  await signInWithMfa(page, user, '/')

  await page.getByTestId('report-link').click()
  await expect(page).toHaveURL('/reports')
  await page.goto('/reports?kind=month&at=2026-09')
  await expect(page.getByRole('heading', { name: 'Settembre 2026' })).toBeVisible()
  await expect(page.getByTestId('report-income')).toContainText(euro(EXPECTED.september.income))
  await expect(page.getByTestId('report-expenses')).toContainText(euro(EXPECTED.september.expenses))
  await expect(page.getByTestId('insight-saved')).toContainText('Hai messo da parte')
  await expect(page.getByTestId('insight-biggest')).toBeVisible()
  await page.screenshot({ path: `tests/e2e/screenshots/local-report-month-${testInfo.project.name}.png`, fullPage: true })

  await page.getByRole('link', { name: 'Periodo precedente' }).click()
  await expect(page.getByRole('heading', { name: 'Agosto 2026' })).toBeVisible()

  await page.getByRole('link', { name: 'Anno', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^2026/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /Entrate e uscite mese per mese/ })).toBeVisible()
  await expect(page.getByTestId('year-compare')).toContainText('Patrimonio a fine anno')
  await expect(page.getByRole('list', { name: 'Patrimonio a fine anno' })).toContainText(euro(EXPECTED.netWorth))
  await page.screenshot({ path: `tests/e2e/screenshots/local-report-year-${testInfo.project.name}.png`, fullPage: true })
})
