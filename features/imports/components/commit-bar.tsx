'use client'

import { Check, X } from 'lucide-react'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'

import { cancelImportAction, commitImportAction, type ImportFormState } from '../actions'

const INITIAL: ImportFormState = { status: 'idle' }

/**
 * Conferma finale. Le righe ancora da verificare non bloccano: alla conferma si
 * riprova con le regole attuali e quelle che restano dubbie entrano "da sistemare".
 * Su telefono la barra sta sopra la navigazione in basso (anche con la safe area iOS).
 */
export function CommitBar({ importId, ready, toReview }: { importId: string; ready: number; toReview: number }) {
  const [commitState, commit, committing] = useActionState(commitImportAction.bind(null, importId), INITIAL)
  const [cancelState, cancel, cancelling] = useActionState(cancelImportAction.bind(null, importId), INITIAL)
  const total = ready + toReview
  const blocked = total === 0
  const reason =
    total === 0
      ? 'Nessuna riga nuova da importare.'
      : `${total === 1 ? '1 riga verrà importata' : `${total} righe verranno importate`}${
          toReview > 0 ? `; ${toReview === 1 ? '1 è' : `${toReview} sono`} da verificare: le regole ci riprovano, il resto lo sistemi poi da Movimenti.` : '.'
        }`
  const error = commitState.status === 'error' ? commitState.message : cancelState.status === 'error' ? cancelState.message : null

  return (
    <div
      data-testid="commit-bar"
      className="sticky bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-20 mt-6 rounded-[var(--radius-card)] border border-line bg-surface/95 p-4 shadow-[var(--shadow-card)] backdrop-blur lg:bottom-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg" aria-live="polite">
          {reason}
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-2 sm:flex">
          <form action={cancel}>
            <Button type="submit" variant="ghost" loading={cancelling} className="min-h-11">
              <X aria-hidden className="size-4" />
              Annulla
            </Button>
          </form>
          <form action={commit}>
            <Button type="submit" disabled={blocked} loading={committing} className="min-h-11 w-full sm:w-auto">
              <Check aria-hidden className="size-4" />
              Conferma importazione
            </Button>
          </form>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  )
}
