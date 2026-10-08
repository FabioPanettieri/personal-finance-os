'use client'

import { Check } from 'lucide-react'
import { useActionState, useState } from 'react'

import type { QuickChoice } from '@/lib/transactions/quick-choices'
import { cn } from '@/lib/utils/cn'

import { classifyTransactionAction, confirmTransactionAction, type ConfirmState } from '../actions'

const INITIAL: ConfirmState = { status: 'idle' }

/**
 * "Cos'è questo movimento?": un tocco sulla risposta, un tocco su Salva.
 * "Ricorda" crea una regola per i prossimi movimenti con la stessa descrizione.
 */
export function QuickClassify({
  id,
  choices,
  current,
  canConfirmCurrent,
}: {
  id: string
  choices: readonly QuickChoice[]
  current: string | null
  canConfirmCurrent: boolean
}) {
  const [state, action, pending] = useActionState(classifyTransactionAction.bind(null, id), INITIAL)
  const [confirmState, confirmAction, confirming] = useActionState(confirmTransactionAction.bind(null, id), INITIAL)
  const [selected, setSelected] = useState<string | null>(null)
  const main = choices.filter((c) => c.group === 'main')
  const categories = choices.filter((c) => c.group === 'category')

  return (
    <div className="flex flex-col gap-5">
      {canConfirmCurrent && current ? (
        <form action={confirmAction}>
          <button
            type="submit"
            disabled={confirming}
            className="flex w-full items-center gap-3 rounded-[16px] border border-positive/40 bg-positive-soft px-4 py-3.5 text-left transition-colors hover:border-positive"
          >
            <Check aria-hidden className="size-5 shrink-0 text-positive" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-fg">Va bene così</span>
              <span className="block truncate text-[13px] text-fg-muted">{current}</span>
            </span>
          </button>
          {confirmState.status === 'error' ? <p className="mt-2 text-sm text-negative">{confirmState.message}</p> : null}
        </form>
      ) : null}

      <form action={action} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[15px] font-semibold text-fg">Cos’è questo movimento?</legend>
          {main.map((choice) => (
            <ChoiceButton key={choice.key} choice={choice} selected={selected === choice.key} onSelect={setSelected} />
          ))}
        </fieldset>
        {categories.length > 0 ? (
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-fg-muted">Oppure una spesa personale:</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categories.map((choice) => (
                <ChoiceButton key={choice.key} choice={choice} selected={selected === choice.key} onSelect={setSelected} compact />
              ))}
            </div>
          </fieldset>
        ) : null}
        <label className="flex min-h-11 items-center gap-3 text-sm text-fg-muted">
          <input type="checkbox" name="remember" defaultChecked className="size-5 accent-[var(--fg)]" />
          Ricorda per i prossimi movimenti uguali
        </label>
        <button
          type="submit"
          disabled={!selected || pending}
          className="h-12 rounded-full bg-fg text-[15px] font-semibold text-canvas transition-opacity disabled:opacity-40"
        >
          {pending ? 'Salvo…' : 'Salva'}
        </button>
        {state.message ? (
          <p role="status" className={cn('text-sm', state.status === 'error' ? 'text-negative' : 'text-positive')}>
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  )
}

function ChoiceButton({
  choice,
  selected,
  onSelect,
  compact = false,
}: {
  choice: QuickChoice
  selected: boolean
  onSelect: (key: string) => void
  compact?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-[16px] border px-4 transition-colors',
        compact ? 'min-h-14 py-2.5' : 'min-h-[60px] py-3',
        selected ? 'border-fg bg-surface-2' : 'border-line bg-surface hover:bg-surface-2',
      )}
    >
      <input type="radio" name="choice" value={choice.key} checked={selected} onChange={() => onSelect(choice.key)} className="sr-only" />
      <span aria-hidden className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2', selected ? 'border-fg bg-fg' : 'border-line-strong')}>
        {selected ? <span className="size-2 rounded-full bg-canvas" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-fg">{choice.label}</span>
        {compact ? null : <span className="block text-[13px] text-fg-muted">{choice.hint}</span>}
      </span>
    </label>
  )
}
