import { expect, test } from '@playwright/test'

import { admin, createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/** Sprint 8: investimenti — valore, rendimento, prezzo di oggi, piano di accumulo (dati sintetici). */
const users: E2EUser[] = []
test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

async function seed(user: E2EUser) {
  const tr = (await admin.from('accounts').select('id').eq('user_id', user.id).eq('name', 'Trade Republic').single()).data!.id as string
  const { data: etf, error } = await admin.from('instruments').insert({ user_id: user.id, isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World' }).select('id').single()
  if (error) throw error
  const { error: e1 } = await admin.from('transactions').insert({
    user_id: user.id,
    account_id: tr,
    booked_on: '2026-09-01',
    description: 'Versamento',
    original_description: 'VERSAMENTO',
    amount_cents: 100000,
    type: 'investment',
    nature: 'investment',
    source: 'manual',
    is_categorized: true,
    categorization_method: 'manual',
    fingerprint: 'c1'.padStart(64, '0'),
  })
  if (e1) throw e1
  const { error: e2 } = await admin.from('investment_transactions').insert({
    user_id: user.id,
    account_id: tr,
    instrument_id: etf.id,
    trade_on: '2026-09-02',
    kind: 'buy',
    quantity: 10,
    price: 90,
    amount_cents: -90000,
    source: 'manual',
    fingerprint: 'c2'.padStart(64, '0'),
  })
  if (e2) throw e2
}

test('investimenti: valore al costo, prezzo di oggi, rendimento e PAC', async ({ page }, testInfo) => {
  const user = await createUser('investments')
  users.push(user)
  await seed(user)
  await signInWithMfa(page, user, '/accounts')

  await page.getByRole('link', { name: /Investimenti/ }).first().click()
  await expect(page).toHaveURL('/investments')
  const hero = page.getByTestId('portfolio-hero')
  await expect(hero).toContainText('1.000,00')
  await expect(hero).toContainText('1 titoli senza prezzo')
  await expect(page.getByTestId('portfolio-gain')).not.toContainText('+')

  await page.getByLabel('Prezzo attuale di iShares Core MSCI World').fill('95,40')
  await page.getByRole('button', { name: 'Aggiorna' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Prezzo aggiornato.' })).toBeVisible()
  await expect(page.getByTestId('portfolio-gain')).toContainText('+54,00')
  await expect(page.getByTestId('position-iShares Core MSCI World')).toContainText('954,00')

  await page.getByText('Aggiungi un piano').click()
  await page.getByLabel('Nome').fill('PAC World')
  await page.getByLabel('Importo (EUR)').fill('150,00')
  await page.getByRole('button', { name: 'Aggiungi piano' }).click()
  await expect(page.getByRole('list', { name: 'Piani di accumulo' })).toContainText('PAC World')
  await expect(page.getByText(/Investi circa 150,00/)).toBeVisible()
  await page.screenshot({ path: `tests/e2e/screenshots/local-investments-${testInfo.project.name}.png`, fullPage: true })
})
