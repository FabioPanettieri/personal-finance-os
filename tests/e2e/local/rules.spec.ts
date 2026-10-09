import { expect, test } from '@playwright/test'

import { admin, createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/** Sprint 11: regola imparata dalle correzioni, applicata ai movimenti da sistemare; nuova regola "proponi soltanto". */
const users: E2EUser[] = []
test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

async function seed(user: E2EUser) {
  const revolut = (await admin.from('accounts').select('id').eq('user_id', user.id).eq('name', 'Revolut').single()).data!.id as string
  const spesa = (await admin.from('transaction_categories').select('id').eq('user_id', user.id).eq('name', 'Spesa').single()).data!.id as string
  const rows = [
    ['PANIFICIO ROSSI 1234 TORINO', true],
    ['PANIFICIO ROSSI 5678 TORINO', true],
    ['PANIFICIO ROSSI 9999 TORINO', false],
  ] as const
  const { error } = await admin.from('transactions').insert(
    rows.map(([description, manual], i) => ({
      user_id: user.id,
      account_id: revolut,
      booked_on: `2026-09-0${i + 1}`,
      description,
      original_description: description,
      amount_cents: -900,
      type: 'expense' as const,
      nature: 'personal' as const,
      category_id: manual ? spesa : null,
      source: 'manual' as const,
      is_categorized: manual,
      categorization_method: manual ? ('manual' as const) : ('none' as const),
      fingerprint: (i + 40).toString(16).padStart(64, '0'),
    })),
  )
  if (error) throw error
}

test('regole: suggerita, applicata, nuova regola', async ({ page }, testInfo) => {
  const user = await createUser('rules')
  users.push(user)
  await seed(user)
  await signInWithMfa(page, user, '/transactions')

  await page.getByRole('link', { name: 'Regole' }).click()
  await expect(page).toHaveURL('/rules')
  const suggestion = page.getByTestId('suggestion-panificio rossi')
  await expect(suggestion).toContainText('2 volte')
  await expect(suggestion).toContainText('Spesa')
  await page.screenshot({ path: `tests/e2e/screenshots/local-rules-${testInfo.project.name}.png`, fullPage: true })
  await suggestion.getByRole('button', { name: 'Crea regola' }).click()
  await expect(page.getByTestId('rule-panificio rossi')).toContainText('Imparata')

  // Affidabilità 85%: propone soltanto, il movimento resta da confermare.
  await page.getByRole('button', { name: 'Applica ai movimenti da sistemare' }).click()
  await expect(page.getByRole('status').filter({ hasText: '0 classificati, 1 con una proposta da confermare' })).toBeVisible()

  const form = page.getByRole('region', { name: 'Nuova regola' })
  await form.getByLabel('Testo da cercare').fill('zorblax')
  await form.getByLabel('Cosa sono').selectOption({ label: 'Svago' })
  await form.getByText('Proponi soltanto: confermo io').click()
  await form.getByRole('button', { name: 'Crea regola' }).click()
  await expect(form.getByRole('status')).toContainText('Regola creata. Corrisponde a 0 movimenti')
  await expect(page.getByTestId('rule-zorblax')).toContainText('propone soltanto')
})
