import { bankForAccount } from '@/lib/banks'

type SplittableAccount = { name: string; institution: string | null; isActive: boolean; balance: number; type: { code: string } }

/**
 * Conti principali (le "carte" colorate: conti correnti e broker delle tre
 * banche) e conti secondari (deposito, carta di credito, altri). I conti
 * disattivati compaiono solo se hanno ancora un saldo.
 */
export function splitAccounts<T extends SplittableAccount>(accounts: readonly T[]): { main: T[]; other: T[] } {
  const visible = accounts.filter((a) => a.isActive || a.balance !== 0)
  const isMain = (a: T) => bankForAccount(a) !== null && ['checking', 'broker'].includes(a.type.code)
  const order = { revolut: 0, ing: 1, trade_republic: 2 } as const
  const main = visible.filter(isMain).sort((a, b) => order[bankForAccount(a)!] - order[bankForAccount(b)!])
  return { main, other: visible.filter((a) => !isMain(a)) }
}
