'use client'

import { Check, X } from 'lucide-react'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'

import { cancelImportAction, commitImportAction, type ImportFormState } from '../actions'

const INITIAL: ImportFormState = { status: 'idle' }

/** Conferma finale: disponibile solo senza righe da verificare. */
export function CommitBar({ importId, ready, toReview }: { importId: string; ready: number; toReview: number }) {
  const [commitState, commit, committing] = useActionState(commitImportAction.bind(null, importId), INITIAL)
  const [cancelState, cancel, cancelling] = useActionState(cancelImportAction.bind(null, importId), INITIAL)
  const blocked = toReview > 0 || ready === 0
  const reason =
    toReview > 0
      ? `${toReview === 1 ? '1 riga da verificare' : `${toReview} righe da verificare`}: classificale o escludile.`
      : ready === 0
        ? 'Nessuna riga nuova da importare.'
        : `${ready === 1 ? '1 riga verrà importata' : `${ready} righe verranno importate`}.`
  const error = commitState.status === 'error' ? commitState.message : cancelState.status === 'error' ? cancelState.message : null

  return (
    <div className="sticky bottom-20 z-10 mt-6 rounded-[var(--radius-card)] border border-line bg-surface/95 p-4 shadow-[var(--shadow-card)] backdrop-blur lg:bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg" aria-live="polite">
          {reason}
        </p>
        <div className="flex gap-2">
          <form action={cancel}>
            <Button type="submit" variant="ghost" loading={cancelling} className="min-h-11">
              <X aria-hidden className="size-4" />
              Annulla
            </Button>
          </form>
          <form action={commit}>
            <Button type="submit" disabled={blocked} loading={committing} className="min-h-11">
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
