import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listAccounts } from '@/server/repositories/accounts'

import {
  accountId,
  admin,
  anonClient,
  createTestUser,
  currentAal,
  deleteTestUser,
  enrollTotp,
  fingerprint,
  signIn,
  verifyTotp,
  type TestUser,
} from './helpers'

/**
 * MFA obbligatoria a livello database (migration 0005), verificata con
 * sessioni REALI emesse da Supabase Auth locale:
 *   Supabase Auth → PostgREST / Storage → RLS → PostgreSQL.
 * AAL1 = login con password; AAL2 = password + TOTP verificato.
 */

const PERMISSION_DENIED = '42501'

let a: TestUser // AAL2, proprietario dei dati di prova
let b: TestUser // AAL2, altro utente
let aIng: string
let bIng: string
let bTransactionId: string

function txRow(accountIdValue: string, seed: string, amount = -1500) {
  return {
    account_id: accountIdValue,
    booked_on: '2026-09-30',
    amount_cents: amount,
    type: 'expense' as const,
    nature: 'personal' as const,
    description: `Movimento sintetico ${seed}`,
    original_description: `SINTETICO ${seed}`,
    fingerprint: fingerprint(seed),
  }
}

beforeAll(async () => {
  a = await createTestUser('aal-a')
  b = await createTestUser('aal-b')
  aIng = await accountId(a.client, 'ING Direct')
  bIng = await accountId(b.client, 'ING Direct')

  const { data, error } = await b.client.from('transactions').insert(txRow(bIng, `b-${b.id}`)).select('id').single()
  if (error) throw error
  bTransactionId = data.id

  const { error: seedError } = await a.client.from('transactions').insert(txRow(aIng, `a-seed-${a.id}`))
  if (seedError) throw seedError
})

afterAll(async () => {
  await deleteTestUser(a)
  await deleteTestUser(b)
})

describe('AAL1: password senza TOTP → nessun accesso ai dati', () => {
  let aal1: Awaited<ReturnType<typeof signIn>>

  beforeAll(async () => {
    // Nuovo login dello stesso utente A: sessione AAL1 anche se il TOTP è già configurato.
    aal1 = await signIn(a)
    expect(await currentAal(aal1)).toBe('aal1')
  })

  it('SELECT → negato (nessuna riga, anche se i dati esistono)', async () => {
    for (const table of ['accounts', 'transactions', 'businesses', 'income_sources', 'transaction_categories', 'profiles', 'audit_logs'] as const) {
      const { data, error } = await aal1.from(table).select('*')
      expect(error, table).toBeNull()
      expect(data, table).toEqual([])
    }
    const balances = await aal1.from('account_balances').select('*')
    expect(balances.data).toEqual([])
    // Controprova con l'amministratore: i dati ci sono.
    const { count } = await admin.from('accounts').select('id', { count: 'exact', head: true }).eq('user_id', a.id)
    expect(count).toBe(5)
  })

  it('INSERT → negato', async () => {
    const tx = await aal1.from('transactions').insert(txRow(aIng, `a-aal1-${randomUUID()}`))
    expect(tx.error?.code).toBe(PERMISSION_DENIED)
    const goal = await aal1.from('goals').insert({ name: 'Obiettivo', target_amount_cents: 100000 })
    expect(goal.error?.code).toBe(PERMISSION_DENIED)
    const imp = await aal1.from('imports').insert({ account_id: aIng, bank_profile: 'ing' })
    expect(imp.error?.code).toBe(PERMISSION_DENIED)
  })

  it('UPDATE → negato, i dati restano invariati', async () => {
    const { data, error } = await aal1.from('accounts').update({ name: 'Modificato in AAL1' }).eq('id', aIng).select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
    const { data: row } = await admin.from('accounts').select('name').eq('id', aIng).single()
    expect(row!.name).toBe('ING Direct')
  })

  it('DELETE → negato, i dati restano', async () => {
    const { data, error } = await aal1.from('transactions').delete().eq('account_id', aIng).select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
    const { count } = await admin.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', aIng)
    expect(count).toBe(1)
  })

  it('Storage: upload, lettura e cancellazione dei CSV negati', async () => {
    const path = `${a.id}/aal1/test.csv`
    const upload = await aal1.storage.from('imports').upload(path, new Blob(['data;importo\n'], { type: 'text/csv' }))
    expect(upload.error).not.toBeNull()

    // File caricato in AAL2 dalla stessa utente: invisibile e non cancellabile in AAL1.
    const ownPath = `${a.id}/aal2/existing.csv`
    const created = await a.client.storage.from('imports').upload(ownPath, new Blob(['x;y\n'], { type: 'text/csv' }))
    expect(created.error).toBeNull()
    const listed = await aal1.storage.from('imports').list(a.id)
    expect(listed.data ?? []).toEqual([])
    const downloaded = await aal1.storage.from('imports').download(ownPath)
    expect(downloaded.data).toBeNull()
    await aal1.storage.from('imports').remove([ownPath])
    const stillThere = await a.client.storage.from('imports').list(`${a.id}/aal2`)
    expect(stillThere.data?.map((f) => f.name)).toEqual(['existing.csv'])
  })

  it('il repository dell’app non restituisce conti con una sessione AAL1', async () => {
    expect(await listAccounts(aal1)).toEqual([])
  })

  it('la verifica TOTP della sessione (AAL1 → AAL2) sblocca l’accesso', async () => {
    await verifyTotp(a, aal1)
    expect(await currentAal(aal1)).toBe('aal2')
    expect(await listAccounts(aal1)).toHaveLength(5)
  })
})

describe('Bootstrap del secondo fattore con sessione AAL1', () => {
  it('un utente nuovo configura il TOTP partendo da AAL1, poi accede ai dati', async () => {
    const fresh = await createTestUser('bootstrap', 'aal1')
    try {
      expect(await currentAal(fresh.client)).toBe('aal1')
      expect(await listAccounts(fresh.client)).toEqual([])
      // I conti iniziali sono stati creati dal trigger di signup, nonostante le policy AAL2.
      const { count } = await admin.from('accounts').select('id', { count: 'exact', head: true }).eq('user_id', fresh.id)
      expect(count).toBe(5)

      await enrollTotp(fresh)
      expect(await currentAal(fresh.client)).toBe('aal2')
      expect((await listAccounts(fresh.client)).map((x) => x.name)).toEqual(['ING Direct', 'ING Conto Risparmio', 'Revolut', 'Carta di credito', 'Trade Republic'])
    } finally {
      await deleteTestUser(fresh)
    }
  })
})

describe('AAL2: password + TOTP → CRUD consentito sui propri dati', () => {
  it('la sessione è AAL2', async () => {
    expect(await currentAal(a.client)).toBe('aal2')
  })

  it('SELECT, INSERT, UPDATE, DELETE consentiti', async () => {
    const seed = `a-aal2-${randomUUID()}`
    const inserted = await a.client.from('transactions').insert(txRow(aIng, seed)).select('id').single()
    expect(inserted.error).toBeNull()

    const selected = await a.client.from('transactions').select('id, notes').eq('id', inserted.data!.id).single()
    expect(selected.error).toBeNull()

    const updated = await a.client.from('transactions').update({ notes: 'verificato' }).eq('id', inserted.data!.id).select('notes').single()
    expect(updated.data?.notes).toBe('verificato')

    const deleted = await a.client.from('transactions').delete().eq('id', inserted.data!.id).select('id')
    expect(deleted.data).toHaveLength(1)
  })

  it('obiettivi, budget e importazioni: scrittura consentita', async () => {
    const goal = await a.client.from('goals').insert({ name: 'Fondo emergenza', target_amount_cents: 1_000_000 }).select('id').single()
    expect(goal.error).toBeNull()
    const budget = await a.client.from('budgets').insert({ name: 'Ottobre', starts_on: '2026-10-01' }).select('id').single()
    expect(budget.error).toBeNull()
    const imp = await a.client.from('imports').insert({ account_id: aIng, bank_profile: 'ing' }).select('id').single()
    expect(imp.error).toBeNull()
  })

  it('Storage: upload, lettura e cancellazione nella propria cartella', async () => {
    const path = `${a.id}/aal2/own.csv`
    expect((await a.client.storage.from('imports').upload(path, new Blob(['a;b\n'], { type: 'text/csv' }))).error).toBeNull()
    expect((await a.client.storage.from('imports').download(path)).data).not.toBeNull()
    expect((await a.client.storage.from('imports').remove([path])).data).toHaveLength(1)
  })

  it('il rinnovo della sessione mantiene AAL2', async () => {
    const { error } = await a.client.auth.refreshSession()
    expect(error).toBeNull()
    expect(await currentAal(a.client)).toBe('aal2')
    expect(await listAccounts(a.client)).toHaveLength(5)
  })
})

describe('Isolamento tra utenti, anche con AAL2', () => {
  it('A → dati di A: consentito', async () => {
    const { data } = await a.client.from('accounts').select('id').eq('id', aIng)
    expect(data).toHaveLength(1)
  })

  it('A → dati di B: lettura negata', async () => {
    expect((await a.client.from('accounts').select('id').eq('id', bIng)).data).toEqual([])
    expect((await a.client.from('transactions').select('id').eq('id', bTransactionId)).data).toEqual([])
  })

  it('A → dati di B: modifica e cancellazione negate', async () => {
    expect((await a.client.from('transactions').update({ notes: 'da A' }).eq('id', bTransactionId).select('id')).data).toEqual([])
    expect((await a.client.from('transactions').delete().eq('id', bTransactionId).select('id')).data).toEqual([])
    const { data } = await admin.from('transactions').select('notes').eq('id', bTransactionId).single()
    expect(data!.notes).toBeNull()
  })

  it('A → inserimento a nome di B o sul conto di B: negato', async () => {
    const asB = await a.client.from('transactions').insert({ ...txRow(aIng, `x-${randomUUID()}`), user_id: b.id })
    expect(asB.error?.code).toBe(PERMISSION_DENIED)
    const onB = await a.client.from('transactions').insert(txRow(bIng, `y-${randomUUID()}`))
    expect(onB.error?.code).toBe('23503')
  })

  it('A → file di B: upload nella cartella di B negato', async () => {
    const upload = await a.client.storage.from('imports').upload(`${b.id}/evil.csv`, new Blob(['x\n'], { type: 'text/csv' }))
    expect(upload.error).not.toBeNull()
  })
})

describe('Anonimo', () => {
  it('nessun accesso ai dati finanziari', async () => {
    const anon = anonClient()
    for (const table of ['accounts', 'transactions', 'goals', 'imports', 'profiles', 'audit_logs'] as const) {
      const { error } = await anon.from(table).select('*')
      expect(error?.code, table).toBe(PERMISSION_DENIED)
    }
    const insert = await anon.from('transactions').insert(txRow(aIng, `anon-${randomUUID()}`))
    expect(insert.error?.code).toBe(PERMISSION_DENIED)
    const upload = await anon.storage.from('imports').upload(`${a.id}/anon.csv`, new Blob(['x\n'], { type: 'text/csv' }))
    expect(upload.error).not.toBeNull()
  })
})
