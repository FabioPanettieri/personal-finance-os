'use client'

import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'

import { formatAmountInput } from '@/lib/money/parse'
import type { Cents } from '@/lib/money'
import { cn } from '@/lib/utils/cn'

import { addToGoalAction, archiveGoalAction, createGoalAction, deleteGoalAction, updateGoalAction, type GoalFormState } from '../actions'

const INITIAL: GoalFormState = { status: 'idle' }
const field = 'flex flex-col gap-1 text-[13px] font-medium text-fg-muted'
const control = 'h-11 rounded-[12px] border border-line bg-surface-2 px-3 text-[15px] text-fg'

function Message({ state }: { state: GoalFormState }) {
  return state.message ? (
    <p role="status" className={cn('text-[13px]', state.status === 'error' ? 'text-negative' : 'text-positive')}>
      {state.message}
    </p>
  ) : null
}

export type AccountOption = { id: string; name: string }
export type GoalValues = {
  name: string
  targetCents: number
  manualCents: number
  deadline: string | null
  tracking: 'manual' | 'linked_accounts'
  links: { accountId: string; shareBps: number }[]
}

/** Nuovo obiettivo o modifica: importo, scadenza, progresso manuale o dai saldi dei conti. */
export function GoalForm({ id, values, accounts }: { id?: string; values?: GoalValues; accounts: AccountOption[] }) {
  const [state, action, pending] = useActionState(id ? updateGoalAction.bind(null, id) : createGoalAction, INITIAL)
  const [tracking, setTracking] = useState<'manual' | 'linked_accounts'>(values?.tracking ?? 'manual')
  const share = (accountId: string) => values?.links.find((l) => l.accountId === accountId)
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={field}>
          Nome
          <input name="name" required maxLength={80} defaultValue={values?.name} placeholder="es. Fondo emergenze" className={control} />
        </label>
        <label className={field}>
          Obiettivo (EUR)
          <input name="target" required inputMode="decimal" autoComplete="off" defaultValue={values ? formatAmountInput(values.targetCents as Cents) : ''} placeholder="es. 5.000,00" className={control} />
        </label>
        <label className={field}>
          Scadenza (facoltativa)
          <input name="deadline" type="date" defaultValue={values?.deadline ?? ''} className={control} />
        </label>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-medium text-fg-muted">Come segui il progresso?</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['manual', 'A mano'],
              ['linked_accounts', 'Dai saldi dei conti'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={cn('inline-flex min-h-10 cursor-pointer items-center rounded-full px-4 text-[13px] font-semibold', tracking === value ? 'bg-fg text-canvas' : 'bg-surface-2 text-fg-muted')}>
              <input type="radio" name="tracking" value={value} checked={tracking === value} onChange={() => setTracking(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {tracking === 'manual' ? (
          <label className={cn(field, 'sm:max-w-xs')}>
            Già messo da parte (EUR)
            <input name="current" inputMode="decimal" autoComplete="off" defaultValue={values ? formatAmountInput(values.manualCents as Cents) : ''} placeholder="0,00" className={control} />
          </label>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Conti collegati">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-[12px] bg-surface-2 px-3 py-2">
                <label className="flex min-h-10 flex-1 items-center gap-2 text-[15px] text-fg">
                  <input type="checkbox" name="account" value={a.id} defaultChecked={Boolean(share(a.id))} className="size-5 accent-[var(--fg)]" />
                  {a.name}
                </label>
                <label className="flex items-center gap-1 text-[13px] text-fg-muted">
                  <span className="sr-only">Quota di {a.name}</span>
                  <input name={`share-${a.id}`} inputMode="decimal" defaultValue={String((share(a.id)?.shareBps ?? 10000) / 100)} className="h-9 w-16 rounded-[10px] border border-line bg-surface px-2 text-right text-[14px] text-fg" />%
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="h-11 rounded-full bg-fg px-6 text-sm font-semibold text-canvas disabled:opacity-50">
          {pending ? 'Salvo…' : id ? 'Salva modifiche' : 'Crea obiettivo'}
        </button>
        <Message state={state} />
      </div>
    </form>
  )
}

export function AddToGoal({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(addToGoalAction.bind(null, id), INITIAL)
  return (
    <form action={action} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`amount-${id}`}>
          Importo per {name}
        </label>
        <input id={`amount-${id}`} name="amount" inputMode="decimal" autoComplete="off" placeholder="Importo, es. 100,00" className={cn(control, 'min-w-0 flex-1')} />
        <button type="submit" name="direction" value="add" disabled={pending} className="h-11 shrink-0 rounded-full bg-fg px-4 text-sm font-semibold text-canvas disabled:opacity-50">
          Aggiungi
        </button>
        <button type="submit" name="direction" value="remove" disabled={pending} className="h-11 shrink-0 rounded-full border border-line px-4 text-sm font-semibold text-fg disabled:opacity-50">
          Togli
        </button>
      </div>
      <Message state={state} />
    </form>
  )
}

export function GoalMenu({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const [archiveState, archive, archiving] = useActionState(() => archiveGoalAction(id, !archived), INITIAL)
  const [deleteState, remove, removing] = useActionState(() => deleteGoalAction(id), INITIAL)
  const error = archiveState.status === 'error' ? archiveState.message : deleteState.status === 'error' ? deleteState.message : null
  return (
    <div className="flex items-center gap-1">
      <form action={archive}>
        <button type="submit" disabled={archiving} aria-label={`${archived ? 'Ripristina' : 'Archivia'} ${name}`} className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
          {archived ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
        </button>
      </form>
      <form
        action={remove}
        onSubmit={(e) => {
          if (!window.confirm(`Eliminare l’obiettivo “${name}”?`)) e.preventDefault()
        }}
      >
        <button type="submit" disabled={removing} aria-label={`Elimina ${name}`} className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-negative">
          <Trash2 aria-hidden className="size-4" />
        </button>
      </form>
      {error ? <span className="text-xs text-negative">{error}</span> : null}
    </div>
  )
}
