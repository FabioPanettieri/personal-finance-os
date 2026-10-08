/**
 * Identità visiva delle banche: Revolut viola, ING arancione, Trade Republic
 * blu (token CSS --bank-*, validati per daltonismo in light e dark). Il
 * colore segue la banca, non il singolo conto: Conto Risparmio e Carta di
 * credito ING sono arancioni come ING Direct.
 */
export type Bank = 'revolut' | 'ing' | 'trade_republic'

export const BANK_LABELS: Record<Bank, string> = { revolut: 'Revolut', ing: 'ING', trade_republic: 'Trade Republic' }

/** Variabile CSS del colore della banca. */
export const BANK_COLOR_VAR: Record<Bank, string> = {
  revolut: 'var(--bank-revolut)',
  ing: 'var(--bank-ing)',
  trade_republic: 'var(--bank-tr)',
}

export function bankForAccount(account: { institution?: string | null; name?: string | null }): Bank | null {
  const text = `${account.institution ?? ''} ${account.name ?? ''}`.toLowerCase()
  if (text.includes('revolut')) return 'revolut'
  if (text.includes('trade republic')) return 'trade_republic'
  if (/\bing\b/.test(text)) return 'ing'
  return null
}

/** Colore da usare per un conto: quello della banca, altrimenti quello scelto per il conto. */
export function accountColor(account: { institution?: string | null; name?: string | null; color?: string | null }): string {
  const bank = bankForAccount(account)
  return bank ? BANK_COLOR_VAR[bank] : (account.color ?? 'var(--fg-subtle)')
}

/** Sfondo "carta" della banca: sfumatura dal colore pieno a una versione più scura. */
export function bankGradient(color: string): string {
  return `linear-gradient(135deg, ${color} 0%, color-mix(in oklab, ${color} 62%, #000) 100%)`
}
