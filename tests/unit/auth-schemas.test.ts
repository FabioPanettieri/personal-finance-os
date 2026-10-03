import { describe, expect, it } from 'vitest'

import { fieldErrorsFrom, loginSchema, totpCodeSchema } from '@/features/auth/schemas'

describe('loginSchema', () => {
  it('valida email e password', () => {
    expect(loginSchema.safeParse({ email: 'me@example.test', password: 'x' }).success).toBe(true)
    const invalid = loginSchema.safeParse({ email: 'nope', password: '' })
    expect(invalid.success).toBe(false)
    if (!invalid.success) {
      expect(fieldErrorsFrom(invalid.error)).toEqual({
        email: 'Inserisci un indirizzo email valido',
        password: 'Inserisci la password',
      })
    }
  })

  it('limita la lunghezza della password', () => {
    expect(loginSchema.safeParse({ email: 'me@example.test', password: 'x'.repeat(257) }).success).toBe(false)
  })
})

describe('totpCodeSchema', () => {
  it('accetta 6 cifre, anche con spazi', () => {
    expect(totpCodeSchema.parse({ code: '123 456' }).code).toBe('123456')
  })

  it.each(['12345', '1234567', 'abcdef', ''])('rifiuta %j', (code) => {
    expect(totpCodeSchema.safeParse({ code }).success).toBe(false)
  })
})
