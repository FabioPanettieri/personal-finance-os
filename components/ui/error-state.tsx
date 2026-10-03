import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

/** Errore mostrato all'utente: mai dettagli tecnici o dati finanziari. */
export function ErrorState({
  title = 'Qualcosa è andato storto',
  description = 'Non è stato possibile caricare questa sezione. Riprova tra poco.',
  action,
  reference,
  className,
}: {
  title?: string
  description?: ReactNode
  action?: ReactNode
  /** Identificativo opaco (digest) utile per cercare l'errore nei log. */
  reference?: string | undefined
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-line bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-4 grid size-11 place-items-center rounded-full bg-negative-soft text-negative">
        <TriangleAlert aria-hidden className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>
      {reference ? <p className="mt-3 font-mono text-xs text-fg-subtle">Rif. {reference}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
