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

test('home: patrimonio, mese, conti con i colori delle banche, da sistemare e dettaglio', async ({ page }, testInfo) => {
  const user = await createUser('dashboard')
  users.push(user)
  await seedDashboard(admin, user.id)
  await signInWithMfa(page, user, '/')

  await page.goto('/?period=custom&from=2026-09-01&to=2026-09-30')
  const kpi = (id: string) => page.getByTestId(id)
  await expect(kpi('kpi-net-worth').getByLabel(euro(EXPECTED.netWorth))).toBeVisible()
  await expect(kpi('kpi-net-worth').getByRole('listitem').filter({ hasText: 'Liquidità' })).toContainText(euro(EXPECTED.liquidity))
  await expect(kpi('kpi-net-worth')).toContainText('Valore di mercato e rendimento')
  await expect(kpi('kpi-income')).toContainText(`+${euro(EXPECTED.september.income)}`)
  await expect(kpi('kpi-expenses')).toContainText(`-${euro(EXPECTED.september.expenses)}`)
  await expect(kpi('kpi-cash-flow')).toContainText('Ti restano')
  await expect(kpi('kpi-cash-flow')).toContainText(euro(EXPECTED.september.cashFlow))

  // Carte delle tre banche, nell'ordine Revolut, ING, Trade Republic, con i saldi di account_balances.
  const cards = page.getByRole('list', { name: 'Conti', exact: true }).getByRole('listitem')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toContainText('Revolut')
  await expect(cards.nth(1)).toContainText('ING Direct')
  await expect(cards.nth(2)).toContainText('Trade Republic')
  await expect(page.getByTestId('bank-card-ING Direct')).toContainText(euro(EXPECTED.balances['ING Direct']))
  await expect(page.getByTestId('account-row-Carta di credito')).toContainText('spese della carta non importate')
  await expect(page.getByTestId('account-row-ING Conto Risparmio')).toContainText(euro(EXPECTED.balances['ING Conto Risparmio']))

  await expect(page.getByTestId('review-card')).toContainText('1 movimento da sistemare')

  await page.screenshot({ path: testInfo.outputPath('home-dark.png'), fullPage: true })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.screenshot({ path: testInfo.outputPath('home-light.png'), fullPage: true })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))

  // Business: VOXEL con margine, "Altro" senza ricavi → N/D.
  await page.goto('/business?period=custom&from=2026-09-01&to=2026-09-30')
  await expect(page.getByTestId('business-VOXEL Studio').getByTestId('margin')).toHaveText('89,6%')
  await expect(page.getByTestId('business-Altro').getByTestId('margin')).toHaveText('N/D')
  await page.screenshot({ path: testInfo.outputPath('business.png'), fullPage: true })

  // Da sistemare → lista filtrata → "Va bene così".
  await page.goto('/?period=custom&from=2026-09-01&to=2026-09-30')
  await page.getByTestId('review-card').click()
  await expect(page).toHaveURL('/transactions?status=review')
  const rows = page.getByRole('list', { name: 'Movimenti' }).getByTestId('transaction-row')
  await expect(rows).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('movimenti.png'), fullPage: true })
  await rows.first().getByRole('link').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Supermercato')
  await expect(page.getByRole('region', { name: 'Sistema il movimento' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('sistema.png'), fullPage: true })
  await page.getByRole('button', { name: /Va bene così/ }).click()
  await expect(page.getByRole('region', { name: 'Sistema il movimento' })).toHaveCount(0)

  // Spese per categoria → lista filtrata con gli stessi movimenti.
  await page.goto('/?period=custom&from=2026-09-01&to=2026-09-30')
  await expect(page.getByTestId('review-card')).toHaveCount(0)
  await page.getByRole('list', { name: 'Spese per categoria' }).getByRole('link').filter({ hasText: 'Casa' }).click()
  await expect(page).toHaveURL(/\/transactions\?from=2026-09-01&to=2026-09-30&category=.*&type=spending/)
  await expect(page.getByRole('list', { name: 'Movimenti' }).getByTestId('transaction-row')).toHaveCount(2)

  // Dettaglio di un trasferimento: gamba collegata, nessuna entrata/spesa.
  await page.goto('/transactions?type=transfer&q=carta')
  await page.getByTestId('transaction-row').filter({ hasText: 'Addebito carta di credito' }).filter({ hasNotText: 'Da ING' }).getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Trasferimento' })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('Carta di credito')
})

test('"Sistema" con una scelta e regola ricordata', async ({ page }) => {
  const user = await createUser('sistema')
  users.push(user)
  await seedDashboard(admin, user.id)
  await signInWithMfa(page, user, '/transactions?status=review')
  await page.getByTestId('transaction-row').first().getByRole('link').click()
  await page.getByText('Spesa VOXEL Studio').click()
  await page.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByRole('region', { name: 'Sistema il movimento' })).toHaveCount(0)
  await expect(page.getByRole('main')).toContainText('VOXEL Studio')
  const { count } = await admin.from('categorization_rules').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('origin', 'learned')
  expect(count).toBe(1)
})

test('home vuota: nessun numero inventato', async ({ page }, testInfo) => {
  const user = await createUser('dashboard-empty')
  users.push(user)
  await signInWithMfa(page, user, '/')
  await expect(page.getByText('Nessun movimento ancora')).toBeVisible()
  await expect(page.getByTestId('kpi-net-worth')).toContainText('—')
  await expect(page.getByTestId('review-card')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('home-empty.png'), fullPage: true })
})
