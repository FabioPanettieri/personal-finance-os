import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { anonClient, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Configurazione reale di Supabase Auth (supabase/config.toml) vista dall'API. */
let owner: TestUser

beforeAll(async () => {
  owner = await createTestUser('owner')
})

afterAll(async () => {
  await deleteTestUser(owner)
})

describe('Supabase Auth locale', () => {
  it('il login con email e password funziona per un utente creato dall’amministratore', async () => {
    const { data } = await owner.client.auth.getUser()
    expect(data.user?.email).toBe(owner.email)
  })

  it('la registrazione pubblica è rifiutata', async () => {
    // eslint-disable-next-line no-restricted-syntax -- il test verifica proprio che signUp sia bloccato lato server
    const { data, error } = await anonClient().auth.signUp({
      email: `intruder-${randomUUID()}@example.test`,
      password: `Pw-${randomUUID()}`,
    })
    expect(data.user).toBeNull()
    expect(error?.code).toBe('signup_disabled')
  })

  it('una sessione con sola password è AAL1: l’app richiederà il TOTP', async () => {
    const { data } = await owner.client.auth.mfa.getAuthenticatorAssuranceLevel()
    expect(data).toMatchObject({ currentLevel: 'aal1', nextLevel: 'aal1' })
  })

  it('il TOTP è abilitato: si può avviare la registrazione di un fattore', async () => {
    const { data, error } = await owner.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'test' })
    expect(error).toBeNull()
    expect(data?.totp.secret).toMatch(/^[A-Z2-7]+=*$/)
    await owner.client.auth.mfa.unenroll({ factorId: data!.id })
  })
})
