import { expect, test } from '@playwright/test'

import { admin, createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/** Sprint 6: selezione multipla, modifica di gruppo, ordinamento e modifica del singolo movimento. Dati sintetici. */
const users: E2EUser[] = []
test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

async function seed(user: E2EUser) {
  const { data: account } = await admin.from('accounts').select('id').eq('user_id', user.id).eq('name', 'Revolut').single()
  const rows = [
    ['Caffè', -250],
    ['Libreria', -1890],
    ['Ferramenta', -4500],
  ] as const
  const { error } = await admin.from('transactions').insert(
    rows.map(([description, amount], i) => ({
      user_id: user.id,
      account_id: account!.id,
      booked_on: `2026-09-0${i + 1}`,
      description,
      original_description: description.toUpperCase(),
      amount_cents: amount,
      type: 'expense' as const,
      nature: 'personal' as const,
      source: 'manual' as const,
      is_categorized: false,
      categorization_method: 'rule' as const,
      fingerprint: (i + 10).toString(16).padStart(64, '0'),
    })),
  )
  if (error) throw error
}

test('explorer: seleziona, conferma, classifica, ordina e modifica', async ({ page }, testInfo) => {
  const user = await createUser('explorer')
  users.push(user)
  await seed(user)
  await signInWithMfa(page, user, '/transactions?status=review')

  const rows = page.getByTestId('transaction-row')
  await expect(rows).toHaveCount(3)
  await page.getByRole('button', { name: 'Seleziona', exact: true }).click()
  await page.getByLabel('Seleziona Caffè').check()
  await page.getByLabel('Seleziona Libreria').check()
  const bar = page.getByRole('form', { name: 'Modifica di gruppo' })
  await expect(bar).toContainText('2 selezionati')
  await page.screenshot({ path: `tests/e2e/screenshots/local-bulk-${testInfo.project.name}.png`, fullPage: true })
  await bar.getByRole('button', { name: 'Conferma' }).click()
  await expect(page.getByRole('status').filter({ hasText: '2 movimenti aggiornati.' })).toBeVisible()
  await expect(rows).toHaveCount(1)

  await page.getByRole('button', { name: 'Seleziona', exact: true }).click()
  await page.getByLabel('Seleziona Ferramenta').check()
  await bar.getByRole('button', { name: 'Classifica come…' }).click()
  await bar.getByRole('button', { name: 'Casa', exact: true }).click()
  await expect(page.getByText('Niente da sistemare')).toBeVisible()

  // Ordinamento: spese più grandi prima.
  await page.goto('/transactions?sort=amount-asc')
  await expect(rows.first()).toContainText('Ferramenta')
  await expect(rows.first()).toContainText('Casa')

  // Modifica del singolo movimento.
  await rows.filter({ hasText: 'Caffè' }).getByRole('link').click()
  await page.getByText('Modifica descrizione, categoria e note').click()
  await page.getByLabel('Descrizione').fill('Caffè con Marco')
  await page.getByLabel('Note').fill('Colazione di lavoro')
  await page.getByRole('button', { name: 'Salva modifiche' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Modifiche salvate.' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Caffè con Marco')
  await expect(page.getByRole('main')).toContainText('Colazione di lavoro')
})
