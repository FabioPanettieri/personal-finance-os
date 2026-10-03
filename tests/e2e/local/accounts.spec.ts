import { expect, test } from '@playwright/test'

import { accountIdFor, admin, createUser, deleteUser, fingerprint, signInWithMfa, type E2EUser } from './support'

/**
 * Sezione Conti end-to-end: browser → Next.js → supabase-js → API locale →
 * PostgREST → PostgreSQL → RLS → UI. Dati sintetici, creati per ogni test.
 */
const users: E2EUser[] = []

async function newUser(label: string) {
  const user = await createUser(label)
  users.push(user)
  return user
}

test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

test('elenco: conti bootstrap con saldo, istituto, valuta, tipo e attività', async ({ page }) => {
  const user = await newUser('list')
  await signInWithMfa(page, user, '/accounts')

  await expect(page.getByRole('heading', { name: 'Conti', level: 1 })).toBeVisible()
  const list = page.getByRole('list', { name: 'Conti attivi' })
  await expect(list.getByRole('listitem')).toHaveCount(3)
  for (const [name, detail] of [
    ['ING Direct', 'ING · EUR'],
    ['Revolut', 'Revolut · EUR'],
    ['Trade Republic', 'Trade Republic · EUR'],
  ] as const) {
    const row = list.getByRole('listitem').filter({ hasText: name })
    await expect(row).toContainText(detail)
    await expect(row).toContainText('Nessuna transazione')
    await expect(row).toContainText('0,00')
  }
  await expect(list.getByRole('listitem').filter({ hasText: 'Trade Republic' })).toContainText('Broker / Investimenti')
  await expect(list.getByRole('listitem').filter({ hasText: 'ING Direct' })).toContainText('Conto corrente')
})

test('dettaglio senza transazioni: stato vuoto, nessun dato inventato', async ({ page }) => {
  const user = await newUser('empty')
  const ing = await accountIdFor(user.id, 'ING Direct')
  await signInWithMfa(page, user, `/accounts/${ing}`)

  await expect(page.getByRole('heading', { name: 'ING Direct', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nessuna transazione' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Andamento del saldo/ })).toHaveCount(0)
})

test('dettaglio con movimenti: flussi, trasferimenti, grafico e tabella dati', async ({ page }, testInfo) => {
  const user = await newUser('detail')
  const ing = await accountIdFor(user.id, 'ING Direct')
  const revolut = await accountIdFor(user.id, 'Revolut')

  // Movimenti sintetici inseriti per conto dell'utente di test.
  const { data: group } = await admin
    .from('transfer_groups')
    .insert({ user_id: user.id, kind: 'internal', detected_by: 'manual' })
    .select('id')
    .single()
  const rows = [
    { account_id: ing, booked_on: '2026-09-01', amount_cents: 210050, type: 'income', nature: 'personal' },
    { account_id: ing, booked_on: '2026-09-03', amount_cents: -65000, type: 'expense', nature: 'personal' },
    { account_id: ing, booked_on: '2026-09-05', amount_cents: -50000, type: 'transfer', nature: 'transfer', transfer_group_id: group!.id },
    { account_id: revolut, booked_on: '2026-09-05', amount_cents: 50000, type: 'transfer', nature: 'transfer', transfer_group_id: group!.id },
  ]
  const { error } = await admin.from('transactions').insert(
    rows.map((row, i) => ({
      ...row,
      user_id: user.id,
      description: `Movimento sintetico ${i}`,
      original_description: `SINTETICO ${i}`,
      fingerprint: fingerprint(`${user.id}-${i}`),
    })),
  )
  expect(error).toBeNull()

  await signInWithMfa(page, user, `/accounts/${ing}`)
  const summary = page.getByRole('region', { name: 'Riepilogo movimenti' })
  await expect(summary).toContainText('2.100,50')
  await expect(summary).toContainText('650,00')
  await expect(summary).toContainText('500,00')
  await expect(summary).toContainText('3')
  await expect(page.getByText(/Ultima attività 5 set 2026/)).toBeVisible()
  // Saldo = 2.100,50 − 650,00 − 500,00.
  await expect(page.locator('header').getByLabel(/950,50/)).toBeVisible()

  const chart = page.getByRole('img', { name: 'Andamento del saldo di ING Direct' })
  await expect(chart).toBeVisible()
  await chart.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('status').filter({ hasText: '1 settembre 2026' })).toContainText('2.100,50')

  await page.getByText('Mostra i dati in tabella').click()
  await expect(page.getByRole('row')).toHaveCount(4)
  await page.screenshot({ path: `tests/e2e/screenshots/local-account-${testInfo.project.name}.png`, fullPage: true })

  // Il trasferimento non ha creato patrimonio: il totale è entrate − spese.
  await page.goto('/accounts')
  await expect(page.getByText('Saldo complessivo').locator('..')).toContainText('1.450,50')
  await expect(page.getByRole('list', { name: 'Conti attivi' }).getByRole('listitem').filter({ hasText: 'ING Direct' })).toContainText(
    '3 transazioni · ultima 5 set 2026',
  )
  await page.screenshot({ path: `tests/e2e/screenshots/local-accounts-${testInfo.project.name}.png`, fullPage: true })
})

test('modifica, validazione, disattivazione e riattivazione', async ({ page }) => {
  const user = await newUser('edit')
  const revolut = await accountIdFor(user.id, 'Revolut')
  await signInWithMfa(page, user, `/accounts/${revolut}`)

  // Validazione lato server.
  await page.getByLabel('Saldo iniziale (EUR)').fill('12.5')
  await page.getByRole('button', { name: 'Salva modifiche' }).click()
  await expect(page.getByText('Usa la virgola per i decimali (es. 12,50)')).toBeVisible()
  await page.getByLabel('Nome').fill('ING Direct')
  await page.getByLabel('Saldo iniziale (EUR)').fill('1.234,56')
  await page.getByRole('button', { name: 'Salva modifiche' }).click()
  await expect(page.getByText('Esiste già un conto con questo nome')).toBeVisible()
  // Regressione: React 19 azzera il form dopo l'action; i valori digitati devono restare.
  await expect(page.getByLabel('Saldo iniziale (EUR)')).toHaveValue('1.234,56')
  await expect(page.getByLabel('Nome')).toHaveValue('ING Direct')

  await page.getByLabel('Nome').fill('Revolut Personale')
  await page.getByLabel('Data del saldo iniziale').fill('2026-09-01')
  await page.getByRole('button', { name: 'Salva modifiche' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Modifiche salvate.' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Revolut Personale', level: 1 })).toBeVisible()
  await expect(page.locator('header').getByLabel(/1\.234,56/)).toBeVisible()

  await page.getByRole('button', { name: 'Disattiva conto' }).click()
  await expect(page.getByRole('button', { name: 'Riattiva conto' })).toBeVisible()
  await page.goto('/accounts')
  await expect(page.getByRole('list', { name: 'Conti disattivati' })).toContainText('Revolut Personale')
  await expect(page.getByRole('list', { name: 'Conti attivi' }).getByRole('listitem')).toHaveCount(2)

  await page.getByRole('list', { name: 'Conti disattivati' }).getByRole('link').click()
  await page.getByRole('button', { name: 'Riattiva conto' }).click()
  await expect(page.getByRole('button', { name: 'Disattiva conto' })).toBeVisible()

  // Le modifiche sono passate davvero dal database.
  const { data } = await admin.from('accounts').select('name, is_active, initial_balance_cents, initial_balance_on').eq('id', revolut).single()
  expect(data).toEqual({ name: 'Revolut Personale', is_active: true, initial_balance_cents: 123456, initial_balance_on: '2026-09-01' })
})

test('isolamento: un altro utente non può aprire i conti altrui', async ({ page }) => {
  const owner = await newUser('owner')
  const intruder = await newUser('intruder')
  const ownerIng = await accountIdFor(owner.id, 'ING Direct')

  await signInWithMfa(page, intruder, '/accounts')
  await expect(page.getByRole('list', { name: 'Conti attivi' }).getByRole('listitem')).toHaveCount(3)
  await page.goto(`/accounts/${ownerIng}`)
  await expect(page.getByRole('heading', { name: 'Conto non trovato' })).toBeVisible()
})

test('mobile: Conti raggiungibile da Patrimonio senza voci extra nella bottom nav', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Percorso specifico per mobile')
  const user = await newUser('mobile')
  await signInWithMfa(page, user)

  const bottomNav = page.locator('nav[aria-label="Navigazione principale"]').last()
  await expect(bottomNav.getByRole('link')).toHaveCount(5)
  await bottomNav.getByRole('link', { name: 'Patrimonio' }).click()
  await page.getByRole('link', { name: /Conti/ }).first().click()
  await expect(page).toHaveURL('/accounts')
  // Sulla sezione Conti resta evidenziata la voce Patrimonio.
  await expect(bottomNav.getByRole('link', { name: 'Patrimonio' })).toHaveAttribute('aria-current', 'page')

  const row = page.getByRole('list', { name: 'Conti attivi' }).getByRole('link').first()
  const box = await row.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
