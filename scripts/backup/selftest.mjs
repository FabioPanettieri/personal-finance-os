// Prova reale di backup e ripristino su Supabase LOCALE (CI e sviluppo, mai sui dati veri):
// backup cifrato → cancella tutti gli utenti e i file → ripristina → stessi conteggi di prima.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { dockerExec, psql } from './docker.mjs'
import { containers } from './lib.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const { db, storage } = containers(root)
const dir = mkdtempSync(join(tmpdir(), 'finanze-backup-test-'))
const env = { ...process.env, BACKUP_DIR: dir, BACKUP_PASSWORD: 'prova-selftest', BACKUP_KEEP: '5' }

const COUNTS = `select string_agg(format('%s=%s', t, n), ' ' order by t) from (
  select 'users' t, count(*) n from auth.users union all
  select 'mfa_factors', count(*) from auth.mfa_factors union all
  select 'accounts', count(*) from public.accounts union all
  select 'transactions', count(*) from public.transactions union all
  select 'imports', count(*) from public.imports union all
  select 'rules', count(*) from public.categorization_rules union all
  select 'objects', count(*) from storage.objects) x`
const fileCount = async () => (await dockerExec(storage, ['sh', '-c', 'find /mnt -type f | wc -l'])).toString().trim()
const run = (script, args = []) => {
  const r = spawnSync(process.execPath, [join(import.meta.dirname, script), ...args], { env, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${script} fallito:\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}

try {
  // Garantisce almeno un utente con dati, anche su un database appena creato.
  await psql(db, `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    values ('00000000-0000-4000-8000-00000000b4c0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'backup-selftest@example.test', '', now(), now(), now()) on conflict do nothing`)
  await psql(db, `insert into public.transactions (user_id, account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
    select a.user_id, a.id, current_date - g, 'PROVA BACKUP ' || g, 'PROVA BACKUP ' || g, -100 * g, 'expense', 'personal', encode(sha256(convert_to('selftest' || g, 'UTF8')), 'hex')
    from public.accounts a, generate_series(1, 25) g
    where a.user_id = '00000000-0000-4000-8000-00000000b4c0' and a.id = (select min(id::text)::uuid from public.accounts where user_id = a.user_id)
    on conflict do nothing`)
  const before = await psql(db, COUNTS)
  const filesBefore = await fileCount()
  run('backup.mjs')

  await psql(db, 'set session_replication_role = replica; delete from storage.objects; reset session_replication_role; delete from auth.users')
  await dockerExec(storage, ['sh', '-c', 'find /mnt -mindepth 1 -delete'])
  const wiped = await psql(db, COUNTS)
  if (wiped === before) throw new Error('la cancellazione di prova non ha cambiato nulla')

  run('restore.mjs', ['--latest', '--yes'])
  const after = await psql(db, COUNTS)
  const filesAfter = await fileCount()
  if (after !== before) throw new Error(`conteggi diversi dopo il ripristino:\n  prima: ${before}\n  dopo:  ${after}`)
  if (filesAfter !== filesBefore) throw new Error(`file diversi dopo il ripristino: ${filesBefore} → ${filesAfter}`)

  // Una password sbagliata non deve toccare nulla.
  const wrong = spawnSync(process.execPath, [join(import.meta.dirname, 'restore.mjs'), '--latest', '--yes'], {
    env: { ...env, BACKUP_PASSWORD: 'sbagliata' },
    encoding: 'utf8',
  })
  if (wrong.status === 0 || !wrong.stderr.includes('Password del backup sbagliata')) throw new Error('password sbagliata non rifiutata')
  if ((await psql(db, COUNTS)) !== before) throw new Error('una password sbagliata ha modificato i dati')

  await psql(db, `delete from auth.users where email = 'backup-selftest@example.test'`)
  console.log(`✓ Backup e ripristino verificati (${after}; file ${filesAfter}).`)
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
