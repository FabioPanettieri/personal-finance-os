'use client'

import { Link2, Unlink } from 'lucide-react'
import { useActionState } from 'react'

import { Money } from '@/components/ui/money'
import { accountColor } from '@/lib/banks'
import { formatIsoDate, type IsoDate } from '@/lib/dates'
import type { Cents } from '@/lib/money'

import { linkTransferAction, unlinkTransferAction, type ConfirmState } from '../actions'

const INITIAL: ConfirmState = { status: 'idle' }

export type CandidateView = {
  id: string
  accountName: string
  accountInstitution: string | null
  bookedOn: IsoDate
  description: string
  amount: Cents
}

/** "È questo?": un tocco collega il movimento all'altra metà proposta. */
export function TransferCandidates({ id, currency, candidates }: { id: string; currency: string; candidates: CandidateView[] }) {
  return (
    <ul aria-label="Possibili altre metà" className="flex flex-col gap-2">
      {candidates.map((c) => (
        <li key={c.id}>
          <CandidateRow id={id} currency={currency} candidate={c} />
        </li>
      ))}
    </ul>
  )
}

function CandidateRow({ id, currency, candidate }: { id: string; currency: string; candidate: CandidateView }) {
  const [state, action, pending] = useActionState(linkTransferAction.bind(null, id, candidate.id), INITIAL)
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 rounded-[16px] border border-line bg-surface-2 px-4 py-3">
      <span aria-hidden className="h-9 w-1 shrink-0 rounded-full" style={{ background: accountColor({ name: candidate.accountName, institution: candidate.accountInstitution }) }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-fg">{candidate.accountName}</span>
        <span className="block truncate text-[13px] text-fg-muted">
          {candidate.description} · {formatIsoDate(candidate.bookedOn)}
        </span>
        {state.status === 'error' ? <span className="block text-[13px] text-negative">{state.message}</span> : null}
      </span>
      <Money value={candidate.amount} currency={currency} signDisplay="exceptZero" className="shrink-0 text-[15px] font-semibold text-fg" />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-fg px-4 text-sm font-semibold text-canvas disabled:opacity-50 sm:w-auto"
      >
        <Link2 aria-hidden className="size-4" />
        {pending ? 'Collego…' : 'Collega'}
      </button>
    </form>
  )
}

export function UnlinkTransferButton({ id, groupId }: { id: string; groupId: string }) {
  const [state, action, pending] = useActionState(unlinkTransferAction.bind(null, id, groupId), INITIAL)
  return (
    <form action={action} className="mt-3">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-medium text-fg-muted hover:text-fg disabled:opacity-50"
      >
        <Unlink aria-hidden className="size-4" />
        {pending ? 'Scollego…' : 'Non è lo stesso trasferimento: scollega'}
      </button>
      {state.status === 'error' ? <p className="mt-2 text-sm text-negative">{state.message}</p> : null}
    </form>
  )
}
