import { expect, test } from '@playwright/test'

import { admin, createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/** Sprint 5: abbinare a mano le due metà di un trasferimento (dati sintetici). */
const users: E2EUser[] = []
test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

async function seed(user: E2EUser) {
  const account = async (name: string) => (await admin.from('accounts').select('id').eq('user_id', user.id).eq('name', name).single()).data!.id as string
  const rows = [
    { account: 'ING Direct', amount: -50000, type: 'transfer', description: 'Bonifico a Revolut', fp: 'e1' },
    { account: 'Revolut', amount: 50000, type: 'income', description: 'Ricarica da ING', fp: 'e2' },
  ] as const
  for (const r of rows) {
    const { error } = await admin.from('transactions').insert({
      user_id: user.id,
      account_id: await account(r.account),
      booked_on: '2026-09-05',
      description: r.description,
      original_description: r.description.toUpperCase(),
      amount_cents: r.amount,
      type: r.type,
      nature: r.type === 'transfer' ? 'transfer' : 'personal',
      source: 'manual',
      is_categorized: true,
      categorization_method: 'manual',
      fingerprint: r.fp.padEnd(64, '0'),
    })
    if (error) throw error
  }
}

test('trasferimento da abbinare: collega, poi scollega', async ({ page }, testInfo) => {
  const user = await createUser('transfers')
  users.push(user)
  await seed(user)
  await signInWithMfa(page, user, '/transactions')

  await page.getByRole('link', { name: /Da abbinare · 1/ }).click()
  await expect(page).toHaveURL('/transactions?status=unmatched')
  const rows = page.getByTestId('transaction-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Da abbinare')
  await rows.first().getByRole('link').click()

  const section = page.getByRole('region', { name: 'Trasferimento' })
  const candidates = section.getByRole('list', { name: 'Possibili altre metà' })
  await expect(candidates.getByRole('listitem')).toHaveCount(1)
  await expect(candidates).toContainText('Revolut')
  await page.screenshot({ path: `tests/e2e/screenshots/local-transfer-match-${testInfo.project.name}.png`, fullPage: true })
  await candidates.getByRole('button', { name: 'Collega' }).click()

  await expect(section).toContainText('non conta né come entrata né come spesa')
  await expect(section.getByRole('link', { name: /Revolut/ })).toBeVisible()
  await page.goto('/transactions?status=unmatched')
  await expect(page.getByText('Niente da abbinare')).toBeVisible()

  // La ricarica su Revolut ora è un trasferimento, non un'entrata.
  await page.goto('/transactions?type=income')
  await expect(page.getByText('Nessun movimento corrisponde ai filtri.')).toBeVisible()

  await page.goto('/transactions?q=Bonifico')
  await page.getByTestId('transaction-row').first().getByRole('link').click()
  await page.getByRole('button', { name: /scollega/ }).click()
  await expect(page.getByRole('region', { name: 'Trasferimento' }).getByRole('list', { name: 'Possibili altre metà' })).toBeVisible()
})
