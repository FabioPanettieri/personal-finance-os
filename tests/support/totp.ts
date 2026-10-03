import { createHmac } from 'node:crypto'

/**
 * Codici TOTP (RFC 6238: SHA-1, passo 30 s, 6 cifre), come un'app di
 * autenticazione. Usato solo dai test per completare la verifica MFA reale
 * su Supabase Auth locale.
 */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const value = alphabet.indexOf(char)
    if (value < 0) throw new Error(`Carattere base32 non valido: ${char}`)
    bits += value.toString(2).padStart(5, '0')
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)))
}

export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1]! & 0x0f
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, '0')
}

/** Millisecondi all'inizio della prossima finestra TOTP. */
export function msUntilNextTotpWindow(now = Date.now()): number {
  return 30_000 - (now % 30_000) + 250
}
