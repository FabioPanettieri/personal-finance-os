import { expect, test } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { seedDashboard } from '../../support/dashboard-seed'
import { admin, createUser, deleteUser, signInWithMfa, type E2EUser } from './support'

/** Stessa cartella impostata in playwright.local.config.ts (BACKUP_DIR del server di test). */
const BACKUP_DIR = join(tmpdir(), 'finanze-e2e-backup')
const users: E2EUser[] = []
test.afterAll(async () => {
  await Promise.all(users.map((u) => deleteUser(u)))
  rmSync(BACKUP_DIR, { recursive: true, force: true })
})

function fakeBackup(date: Date, encrypted: boolean) {
  const p = (n: number) => String(n).padStart(2, '0')
  const name = `finanze-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`
  mkdirSync(join(BACKUP_DIR, name), { recursive: true })
  writeFileSync(join(BACKUP_DIR, name, 'info.json'), JSON.stringify({ app: 'Finanze', format: 1, encrypted }))
}

test('impostazioni: profilo, stato del backup e avviso in Home', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Logica uguale su telefono; la larghezza è in mobile-width')
  rmSync(BACKUP_DIR, { recursive: true, force: true })
  const user = await createUser('settings')
  users.push(user)
  await seedDashboard(admin, user.id)
  await signInWithMfa(page, user, '/')

  // Nessun backup: avviso in Home, badge nelle impostazioni, istruzioni nella pagina.
  await expect(page.getByTestId('backup-warning')).toContainText('Nessun backup')
  await page.goto('/settings')
  await expect(page.getByTestId('backup-badge')).toHaveText('Nessun backup')
  await page.getByRole('link', { name: /Backup/ }).click()
  await expect(page.getByRole('heading', { name: 'Backup', level: 1 })).toBeVisible()
  await expect(page.getByTestId('backup-status')).toContainText('Nessun backup trovato')
  await expect(page.getByTestId('backup-folder')).toHaveText(BACKUP_DIR)

  // Backup vecchio: da aggiornare.
  fakeBackup(new Date(Date.now() - 9 * 86_400_000), false)
  await page.reload()
  await expect(page.getByTestId('backup-status')).toContainText('Più vecchio di 7 giorni')
  await expect(page.getByTestId('backup-status')).toContainText('Senza password')

  // Backup recente e cifrato: tutto in ordine, nessun avviso.
  fakeBackup(new Date(Date.now() - 3_600_000), true)
  await page.reload()
  await expect(page.getByTestId('backup-status')).toContainText('Aggiornato')
  await expect(page.getByTestId('backup-status')).toContainText('Con password')
  await expect(page.getByTestId('backup-status')).toContainText('2')
  await page.goto('/')
  await expect(page.getByTestId('backup-warning')).toHaveCount(0)

  // Profilo: il nome cambia il saluto; un fuso orario resta salvato.
  await page.goto('/settings/profile')
  await page.getByLabel('Nome', { exact: true }).fill('Ada Lovelace')
  await page.getByLabel('Fuso orario').selectOption('Europe/London')
  await page.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByRole('status')).toHaveText('Profilo salvato.')
  await page.reload()
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Ada Lovelace')
  await expect(page.getByLabel('Fuso orario')).toHaveValue('Europe/London')
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/, Ada$/)
})
