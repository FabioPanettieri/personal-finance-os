import { expect, test } from '@playwright/test'

import { createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/** Sprint 10: obiettivi — crea, aggiungi, card in Home, collegamento ai conti. */
const users: E2EUser[] = []
test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
})

test('obiettivi: crea, aggiungi, vedi in Home, segui i saldi', async ({ page, isMobile }, testInfo) => {
  const user = await createUser('goals')
  users.push(user)
  await signInWithMfa(page, user, '/')

  await page.getByTestId('home-goals').getByRole('link', { name: 'Crea', exact: true }).click()
  await expect(page).toHaveURL('/goals')
  const form = page.getByRole('region', { name: 'Nuovo obiettivo' })
  await form.getByLabel('Nome').fill('Vacanza in Giappone')
  await form.getByLabel('Obiettivo (EUR)').fill('3.000,00')
  await form.getByLabel('Già messo da parte (EUR)').fill('600,00')
  await form.getByRole('button', { name: 'Crea obiettivo' }).click()

  const card = page.getByTestId('goal-Vacanza in Giappone')
  await expect(card).toContainText('20,0%')
  await card.getByLabel('Importo per Vacanza in Giappone').fill('150,00')
  await card.getByRole('button', { name: 'Aggiungi' }).click()
  await expect(card).toContainText('750,00')
  await expect(card).toContainText('25,0%')

  await form.getByLabel('Nome').fill('Fondo emergenze')
  await form.getByLabel('Obiettivo (EUR)').fill('1.000,00')
  await form.getByText('Dai saldi dei conti').click()
  await form.getByRole('checkbox', { name: 'ING Conto Risparmio' }).check()
  await form.getByRole('button', { name: 'Crea obiettivo' }).click()
  await expect(page.getByTestId('goal-Fondo emergenze')).toContainText('Dai saldi di ING Conto Risparmio')
  // Nessuno scorrimento orizzontale sul telefono.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  if (isMobile) expect(await page.evaluate(() => window.innerWidth)).toBeLessThan(460)
  await page.screenshot({ path: `tests/e2e/screenshots/local-goals-${testInfo.project.name}.png`, fullPage: true })

  await page.goto('/')
  await expect(page.getByRole('list', { name: 'Obiettivi in corso' })).toContainText('Vacanza in Giappone')
})
