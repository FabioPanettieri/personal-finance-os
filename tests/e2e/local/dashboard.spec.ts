import { expect, test } from '@playwright/test'

import { EXPECTED, seedDashboard } from '../../support/dashboard-seed'
import { admin, createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/**
 * Dashboard end-to-end sullo stack Supabase locale, con dati sintetici e
 * periodo personalizzato fisso (settembre 2026): i numeri sono deterministici.
 */
const users: E2EUser[] = []
test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

const euro = (cents: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(cents / 100)

test('dashboard: KPI, grafici, conti, attività recenti, da verificare e dettaglio', async ({ page }, testInfo) => {
  const user = await createUser('dashboard')
  users.push(user)
  await seedDashboard(admin, user.id)
  await signInWithMfa(page, user, '/')

  await page.goto('/?period=custom&from=2026-09-01&to=2026-09-30')
  const kpi = (id: string) => page.getByTestId(id)
  await expect(kpi('kpi-net-worth')).toContainText(euro(EXPECTED.netWorth).replace(/,\d\d.*/, ''))
  await expect(kpi('kpi-net-worth')).toHaveAttribute('data-testid', 'kpi-net-worth')
  await expect(kpi('kpi-net-worth').getByLabel(euro(EXPECTED.netWorth))).toBeVisible()
  await expect(kpi('kpi-liquidity').getByLabel(euro(EXPECTED.liquidity))).toBeVisible()
  await expect(kpi('kpi-income').getByLabel(euro(EXPECTED.september.income))).toBeVisible()
  await expect(kpi('kpi-expenses').getByLabel(euro(EXPECTED.september.expenses))).toBeVisible()
  await expect(kpi('kpi-cash-flow')).toContainText(euro(EXPECTED.september.cashFlow))
  await expect(kpi('kpi-net-worth')).toContainText('valore di mercato non disponibile')

  // Attività: VOXEL con margine, "Altro" senza ricavi → N/D.
  await expect(page.getByTestId('business-VOXEL Studio').getByTestId('margin')).toHaveText('89,6%')
  await expect(page.getByTestId('business-Altro').getByTestId('margin')).toHaveText('N/D')

  // Conti con i saldi di account_balances.
  const accounts = page.getByRole('list', { name: 'Conti', exact: true })
  await expect(accounts.getByRole('listitem')).toHaveCount(5)
  await expect(accounts.getByRole('listitem').filter({ hasText: 'Carta di credito' })).toContainText('le spese della carta non sono importate')

  // Da verificare → lista filtrata.
  await expect(page.getByTestId('review-card')).toContainText('1 movimento richiede attenzione')

  await page.screenshot({ path: testInfo.outputPath('dashboard-light.png'), fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.screenshot({ path: testInfo.outputPath('dashboard-dark.png'), fullPage: true })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))

  await page.getByRole('link', { name: 'Verifica movimenti' }).click()
  await expect(page).toHaveURL('/transactions?status=review')
  const rows = page.getByRole('list', { name: 'Movimenti' }).getByRole('listitem')
  await expect(rows).toHaveCount(1)
  await rows.first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Supermercato')
  await page.getByRole('button', { name: 'Conferma classificazione' }).click()
  // Dopo la conferma il movimento non è più da verificare.
  await expect(page.getByRole('button', { name: 'Conferma classificazione' })).toHaveCount(0)
  await expect(page.getByText('Da verificare', { exact: true })).toHaveCount(0)

  // Spese per categoria → lista filtrata con gli stessi movimenti.
  await page.goto('/?period=custom&from=2026-09-01&to=2026-09-30')
  await expect(page.getByTestId('review-card')).toHaveCount(0)
  await page.getByRole('list', { name: 'Spese per categoria' }).getByRole('link').filter({ hasText: 'Casa' }).click()
  await expect(page).toHaveURL(/\/transactions\?from=2026-09-01&to=2026-09-30&category=.*&type=spending/)
  await expect(page.getByRole('list', { name: 'Movimenti' }).getByRole('listitem')).toHaveCount(2)

  // Dettaglio di un trasferimento: gamba collegata, nessuna entrata/spesa.
  await page.goto('/transactions?type=transfer&q=carta')
  await page.getByRole('list', { name: 'Movimenti' }).getByRole('listitem').filter({ hasText: 'Addebito carta di credito' }).filter({ hasNotText: 'Da ING' }).click()
  await expect(page.getByRole('heading', { name: 'Trasferimento' })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('Carta di credito')
})

test('dashboard vuota: nessun numero inventato', async ({ page }, testInfo) => {
  const user = await createUser('dashboard-empty')
  users.push(user)
  await signInWithMfa(page, user, '/')
  await expect(page.getByRole('heading', { name: 'Nessun movimento ancora' })).toBeVisible()
  await expect(page.getByTestId('kpi-net-worth')).toContainText('—')
  await expect(page.getByText('Nessun movimento ancora: lo storico parte dalla prima importazione.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Ultime importazioni' })).toContainText('Nessun import')
  await page.screenshot({ path: testInfo.outputPath('dashboard-empty.png'), fullPage: true })
})
