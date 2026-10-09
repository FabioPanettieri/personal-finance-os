import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// @ts-expect-error -- modulo .mjs senza tipi (script Node eseguito senza build)
import * as lib from '../../scripts/backup/lib.mjs'
import { backupStatus, defaultBackupDir, parseBackupName } from '@/lib/backup/status'

describe('backup: nomi, rotazione, frequenza', () => {
  it('il nome contiene data e ora locali e si ordina come la data', () => {
    expect(lib.backupName(new Date(2026, 9, 9, 7, 5))).toBe('finanze-2026-10-09-0705')
    expect(lib.parseBackupName('finanze-2026-10-09-0705')).toEqual(new Date(2026, 9, 9, 7, 5))
    expect(lib.parseBackupName('finanze-2026-10-09-0705-2')).toEqual(new Date(2026, 9, 9, 7, 5))
    expect(lib.parseBackupName('finanze-2026-10-09-0705.partial')).toBeNull()
    expect(lib.parseBackupName('altro')).toBeNull()
  })

  it('tiene i più recenti e cancella i più vecchi', () => {
    const names = ['finanze-2026-10-01-0900', 'finanze-2026-10-03-0900', 'finanze-2026-10-02-0900', 'finanze-2026-10-03-0900-2']
    expect(lib.toPrune(names, 2)).toEqual(['finanze-2026-10-02-0900', 'finanze-2026-10-01-0900'])
    expect(lib.toPrune(names, 10)).toEqual([])
  })

  it('--daily salta solo se c’è un backup delle ultime 20 ore', () => {
    const now = new Date(2026, 9, 9, 12, 0)
    expect(lib.isRecent(new Date(2026, 9, 9, 8, 0), now)).toBe(true)
    expect(lib.isRecent(new Date(2026, 9, 8, 15, 0), now)).toBe(false)
  })

  it('BACKUP_KEEP valido oppure 30; BACKUP_DIR oppure la cartella predefinita fuori dal repository', () => {
    expect(lib.keepCount({ BACKUP_KEEP: '7' })).toBe(7)
    expect(lib.keepCount({ BACKUP_KEEP: '0' })).toBe(30)
    expect(lib.keepCount({})).toBe(30)
    expect(lib.backupDir({ BACKUP_DIR: ' /x/y ' })).toBe('/x/y')
    expect(lib.defaultBackupDir('linux', '/home/u')).toBe('/home/u/finanze-backup')
  })

  it('lo script e l’app usano la stessa cartella predefinita e lo stesso formato del nome', () => {
    expect(defaultBackupDir('linux', '/home/u')).toBe(lib.defaultBackupDir('linux', '/home/u'))
    expect(defaultBackupDir('win32', 'C:\\Users\\u')).toBe('C:\\Users\\u\\Documents\\Finanze backup')
    expect(parseBackupName('finanze-2026-10-09-0705-3')).toEqual(lib.parseBackupName('finanze-2026-10-09-0705-3'))
  })

  it('elenca solo i backup completi (con info.json), dal più recente', () => {
    const dir = mkdtempSync(join(tmpdir(), 'finanze-backup-unit-'))
    try {
      for (const name of ['finanze-2026-10-01-0900', 'finanze-2026-10-02-0900', 'finanze-2026-10-03-0900.partial']) {
        mkdirSync(join(dir, name))
        writeFileSync(join(dir, name, 'info.json'), '{}')
      }
      mkdirSync(join(dir, 'finanze-2026-10-04-0900'))
      expect(lib.listBackups(dir).map((b: { name: string }) => b.name)).toEqual(['finanze-2026-10-02-0900', 'finanze-2026-10-01-0900'])
      expect(lib.listBackups(join(dir, 'manca'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('backup: cifratura', () => {
  const data = Buffer.from('COPY public.transactions … dati di prova')

  it('cifra e decifra con la stessa password', () => {
    const enc = lib.encrypt(data, 'una password lunga')
    expect(lib.isEncrypted(enc)).toBe(true)
    expect(enc.includes(data)).toBe(false)
    expect(lib.decrypt(enc, 'una password lunga').equals(data)).toBe(true)
  })

  it('rifiuta password sbagliata, file alterato e password mancante', () => {
    const enc: Buffer = lib.encrypt(data, 'giusta')
    expect(() => lib.decrypt(enc, 'sbagliata')).toThrow(/Password del backup sbagliata/)
    const tampered = Buffer.from(enc)
    tampered.writeUInt8(tampered.readUInt8(tampered.length - 20) ^ 1, tampered.length - 20)
    expect(() => lib.decrypt(tampered, 'giusta')).toThrow(/sbagliata|danneggiato/)
    expect(() => lib.encrypt(data, '')).toThrow(/BACKUP_PASSWORD/)
    expect(() => lib.decrypt(data, 'giusta')).toThrow(/non è cifrato/)
  })

  it('due cifrature dello stesso file sono diverse (sale e IV casuali)', () => {
    expect(lib.encrypt(data, 'p').equals(lib.encrypt(data, 'p'))).toBe(false)
  })
})

describe('backup: dump e ripristino', () => {
  it('pg_dump salva solo i dati di public, auth e storage, senza sessioni né tabelle di servizio', () => {
    const args: string[] = lib.pgDumpArgs()
    expect(args).toContain('--data-only')
    for (const s of ['public', 'auth', 'storage']) expect(args.join(' ')).toContain(`--schema ${s}`)
    for (const t of ['auth.sessions', 'auth.refresh_tokens', 'auth.schema_migrations', 'storage.migrations']) {
      expect(args.join(' ')).toContain(`--exclude-table-data ${t}`)
    }
  })

  it('il ripristino è una transazione unica che svuota le tabelle dell’app ma non quelle di servizio', () => {
    const sql: string = lib.restorePrelude(['auth.users', 'auth.schema_migrations', 'public.transactions', 'storage.objects'])
    expect(sql).toMatch(/ON_ERROR_STOP on/)
    expect(sql).toMatch(/^BEGIN;$/m)
    expect(sql).toContain('TRUNCATE "auth"."users", "public"."transactions", "storage"."objects" CASCADE;')
    expect(sql).not.toContain('schema_migrations')
    expect(lib.RESTORE_EPILOGUE).toContain('COMMIT;')
  })

  it('nomi dei container dal project_id di supabase/config.toml', () => {
    expect(lib.containers(process.cwd())).toEqual({ db: 'supabase_db_personal-finance-os', storage: 'supabase_storage_personal-finance-os' })
  })
})

describe('backup: stato mostrato nell’app', () => {
  const now = new Date(2026, 9, 9, 12, 0)

  it('nessun backup', () => {
    expect(backupStatus([], false, now)).toEqual({ kind: 'none' })
    expect(backupStatus(['altro'], false, now)).toEqual({ kind: 'none' })
  })

  it('aggiornato sotto i 7 giorni, da aggiornare da 7 in su', () => {
    const ok = backupStatus(['finanze-2026-10-01-0900', 'finanze-2026-10-08-2300'], true, now)
    expect(ok).toMatchObject({ kind: 'ok', days: 0, count: 2, encrypted: true })
    expect(backupStatus(['finanze-2026-10-02-0900'], false, now)).toMatchObject({ kind: 'stale', days: 7 })
  })
})
