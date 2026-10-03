import { expect, test } from '@playwright/test'
import { join } from 'node:path'

import { admin, createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/**
 * Importazione CSV end-to-end sullo stack Supabase locale, con fixture
 * sintetiche: upload → anteprima → correzione → conferma → conto → reimport.
 */
const fixture = (path: string) => join(process.cwd(), 'tests', 'fixtures', 'csv', path)
const users: E2EUser[] = []

test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

test('ING: anteprima, righe da verificare, correzione, esclusione, conferma e reimport', async ({ page }, testInfo) => {
  const user = await createUser('import')
  users.push(user)
  await signInWithMfa(page, user, '/imports')

  await expect(page.getByRole('heading', { name: 'Nessuna importazione' })).toBeVisible()
  await page.getByRole('link', { name: 'Importa CSV' }).first().click()
  await expect(page).toHaveURL('/imports/new')

  // ING preselezionata, conto ING Direct proposto.
  await expect(page.getByLabel('Conto di destinazione')).toHaveValue(
    (await admin.from('accounts').select('id').eq('user_id', user.id).eq('name', 'ING Direct').single()).data!.id as string,
  )
  await page.getByLabel('File CSV').setInputFiles(fixture('ing/completo.csv'))
  await page.getByRole('button', { name: /Analizza e mostra l’anteprima/ }).click()
  await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}$/)

  const summary = page.getByRole('region', { name: 'Riepilogo' })
  await expect(summary).toContainText('Trovate9')
  await expect(summary).toContainText('Nuove7')
  await expect(summary).toContainText('Da verificare2')

  // Nessuna transazione prima della conferma.
  const { count: before } = await admin.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  expect(before).toBe(0)

  const commit = page.getByRole('button', { name: 'Conferma importazione' })
  await expect(commit).toBeDisabled()
  await expect(page.getByText('2 righe da verificare: classificale o escludile.')).toBeVisible()
  await page.screenshot({ path: `tests/e2e/screenshots/local-import-preview-${testInfo.project.name}.png`, fullPage: true })

  await page.getByRole('link', { name: /Da verificare/ }).click()
  const unknown = page.getByRole('listitem').filter({ hasText: 'OPERAZIONE SCONOSCIUTA XYZ' })
  await unknown.getByRole('button', { name: 'Classifica' }).click()
  await unknown.getByLabel('Tipo').selectOption('expense')
  await unknown.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'OPERAZIONE SCONOSCIUTA XYZ' })).toHaveCount(0)

  const received = page.getByRole('listitem').filter({ hasText: 'BONIFICO RICEVUTO DA MARIO ESEMPIO' })
  await expect(received).toContainText('entrata o trasferimento')
  await received.getByRole('button', { name: 'Escludi' }).click()
  await expect(page.getByRole('heading', { name: 'Nessuna riga' })).toBeVisible()

  await expect(commit).toBeEnabled()
  await expect(page.getByText('8 righe verranno importate.')).toBeVisible()
  await commit.click()
  await expect(page.getByRole('heading', { name: /Importazione · ING Direct/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Riepilogo' })).toContainText('Importate8')

  // Il conto mostra i movimenti importati: saldo dalle transazioni, non dal CSV.
  await page.getByRole('link', { name: 'conto ING Direct' }).click()
  await expect(page.locator('header').getByLabel(/669,65/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Riepilogo movimenti' })).toContainText('8')

  // Reimport dello stesso file: le 8 righe importate sono duplicate.
  await page.goto('/imports/new')
  await page.getByLabel('File CSV').setInputFiles(fixture('ing/completo.csv'))
  await page.getByRole('button', { name: /Analizza e mostra l’anteprima/ }).click()
  await expect(page.getByRole('region', { name: 'Riepilogo' })).toContainText('Duplicate8')

  await page.goto('/imports')
  await expect(page.getByRole('list', { name: 'Storico importazioni' }).getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('list', { name: 'Storico importazioni' })).toContainText('8 importate')
})

test('file della banca sbagliata: errore chiaro, nessuna importazione', async ({ page }) => {
  const user = await createUser('wrong-bank')
  users.push(user)
  await signInWithMfa(page, user, '/imports/new')

  await page.getByText('Revolut', { exact: true }).click()
  await page.getByLabel('File CSV').setInputFiles(fixture('trade-republic/fixture-utente.csv'))
  await page.getByRole('button', { name: /Analizza e mostra l’anteprima/ }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Il file sembra un export Trade Republic, non Revolut')
  const { count } = await admin.from('imports').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  expect(count).toBe(0)
})

test('Trade Republic: acquisto ETF come operazione su titoli, versamento come cassa', async ({ page }) => {
  const user = await createUser('tr')
  users.push(user)
  await signInWithMfa(page, user, '/imports/new')

  await page.getByText('Trade Republic', { exact: true }).click()
  await page.getByLabel('File CSV').setInputFiles(fixture('trade-republic/fixture-utente.csv'))
  await page.getByRole('button', { name: /Analizza e mostra l’anteprima/ }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Core MSCI World' })).toContainText('Operazione titoli')
  await expect(page.getByRole('listitem').filter({ hasText: 'PAC mensile' })).toContainText('Trasferimento')
  await page.getByRole('button', { name: 'Conferma importazione' }).click()
  await expect(page.getByRole('region', { name: 'Riepilogo' })).toContainText('Importate2')

  const { data: trades } = await admin.from('investment_transactions').select('kind, amount_cents').eq('user_id', user.id)
  expect(trades).toEqual([{ kind: 'buy', amount_cents: -20000 }])
  const { data: cash } = await admin.from('transactions').select('type, amount_cents').eq('user_id', user.id)
  expect(cash).toEqual([{ type: 'transfer', amount_cents: 20000 }])
})
