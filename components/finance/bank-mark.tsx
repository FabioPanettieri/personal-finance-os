import { BANK_COLOR_VAR, BANK_LABELS, bankForAccount } from '@/lib/banks'
import { cn } from '@/lib/utils/cn'

/** Sigla della banca nel suo colore (ING, R, TR): riconosci la banca a colpo d'occhio. */
const MARK = { ing: 'ING', revolut: 'R', trade_republic: 'TR' } as const

export function BankMark({ account, className }: { account: { institution?: string | null; name?: string | null }; className?: string }) {
  const bank = bankForAccount(account)
  if (!bank) return null
  return (
    <span
      title={BANK_LABELS[bank]}
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full font-extrabold leading-none text-white ring-2 ring-surface', className)}
      // Colore della banca scurito: la sigla bianca resta leggibile su tutti e tre.
      style={{ background: `color-mix(in oklab, ${BANK_COLOR_VAR[bank]} 72%, #000)` }}
    >
      {MARK[bank]}
    </span>
  )
}
