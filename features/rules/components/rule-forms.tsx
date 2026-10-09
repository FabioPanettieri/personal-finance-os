'use client'

import { Pause, Play, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { useActionState, useState } from 'react'

import { EXPENSE_CHOICES, INCOME_CHOICES } from '@/lib/transactions/quick-choices'
import { cn } from '@/lib/utils/cn'

import { acceptSuggestionAction, applyRulesAction, autoApplyRuleAction, createRuleAction, deleteRuleAction, toggleRuleAction, type RuleFormState } from '../actions'

const INITIAL: RuleFormState = { status: 'idle' }
const field = 'flex flex-col gap-1 text-[13px] font-medium text-fg-muted'
const control = 'h-11 rounded-[12px] border border-line bg-surface-2 px-3 text-[15px] text-fg'

function Message({ state }: { state: RuleFormState }) {
  return state.message ? (
    <p role="status" className={cn('text-[13px]', state.status === 'error' ? 'text-negative' : 'text-positive')}>
      {state.message}
    </p>
  ) : null
}

export function ApplyRulesButton({ pending: toReview }: { pending: number }) {
  const [state, action, pending] = useActionState(applyRulesAction, INITIAL)
  return (
    <form action={action} className="flex flex-col gap-2">
      <button type="submit" disabled={pending || toReview === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-fg px-5 text-sm font-semibold text-canvas disabled:opacity-40">
        <Wand2 aria-hidden className="size-4" />
        {pending ? 'Applico…' : 'Applica ai movimenti da sistemare'}
      </button>
      <Message state={state} />
    </form>
  )
}

export function AcceptSuggestion({ pattern, direction }: { pattern: string; direction: 'in' | 'out' }) {
  const [state, action, pending] = useActionState(() => acceptSuggestionAction(pattern, direction), INITIAL)
  return (
    <form action={action} className="flex shrink-0 flex-col items-end gap-1">
      <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-fg px-4 text-sm font-semibold text-canvas disabled:opacity-50">
        <Sparkles aria-hidden className="size-4" />
        Crea regola
      </button>
      {state.status === 'error' ? <span className="text-xs text-negative">{state.message}</span> : null}
    </form>
  )
}

export function RuleActions({ id, name, isActive, autoApply }: { id: string; name: string; isActive: boolean; autoApply: boolean }) {
  const [, toggle, toggling] = useActionState(() => toggleRuleAction(id, !isActive), INITIAL)
  const [, setAuto, settingAuto] = useActionState(() => autoApplyRuleAction(id, !autoApply), INITIAL)
  const [, remove, removing] = useActionState(() => deleteRuleAction(id), INITIAL)
  return (
    <div className="flex shrink-0 items-center gap-1">
      <form action={setAuto}>
        <button
          type="submit"
          disabled={settingAuto}
          aria-label={`${autoApply ? 'Fai solo proporre' : 'Fai applicare da sola'} ${name}`}
          className="h-9 rounded-full border border-line px-3 text-[12px] font-semibold text-fg-muted hover:text-fg"
        >
          {autoApply ? 'Da sola' : 'Propone'}
        </button>
      </form>
      <form action={toggle}>
        <button type="submit" disabled={toggling} aria-label={`${isActive ? 'Disattiva' : 'Attiva'} ${name}`} className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
          {isActive ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
        </button>
      </form>
      <form
        action={remove}
        onSubmit={(e) => {
          if (!window.confirm(`Eliminare la regola “${name}”?`)) e.preventDefault()
        }}
      >
        <button type="submit" disabled={removing} aria-label={`Elimina ${name}`} className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-negative">
          <Trash2 aria-hidden className="size-4" />
        </button>
      </form>
    </div>
  )
}

/** Nuova regola: cosa cercare, dove, uscite o entrate, cosa sono, e se applicarla da sola. */
export function NewRuleForm() {
  const [state, action, pending] = useActionState(createRuleAction, INITIAL)
  const [direction, setDirection] = useState<'in' | 'out'>('out')
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={cn(field, 'sm:col-span-1')}>
          Testo da cercare
          <input name="pattern" required maxLength={200} placeholder="es. esselunga" className={control} />
        </label>
        <label className={field}>
          Come
          <select name="matchType" defaultValue="contains" className={control}>
            <option value="contains">Contiene</option>
            <option value="starts_with">Inizia con</option>
            <option value="equals">È uguale a</option>
          </select>
        </label>
        <label className={field}>
          Dove
          <select name="matchField" defaultValue="description" className={control}>
            <option value="description">Descrizione</option>
            <option value="counterparty">Controparte</option>
          </select>
        </label>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-medium text-fg-muted">Per quali movimenti?</legend>
        <div className="flex gap-2">
          {(
            [
              ['out', 'Uscite'],
              ['in', 'Entrate'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={cn('inline-flex min-h-10 cursor-pointer items-center rounded-full px-4 text-[13px] font-semibold', direction === value ? 'bg-fg text-canvas' : 'bg-surface-2 text-fg-muted')}>
              <input type="radio" name="direction" value={value} checked={direction === value} onChange={() => setDirection(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={field}>
          Cosa sono
          <select name={`choice-${direction}`} key={direction} required defaultValue="" className={control}>
            <option value="" disabled>
              Scegli…
            </option>
            {(direction === 'in' ? INCOME_CHOICES : EXPENSE_CHOICES).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Importo da (facoltativo)
          <input name="amountMin" inputMode="decimal" autoComplete="off" placeholder="0,00" className={control} />
        </label>
        <label className={field}>
          a (facoltativo)
          <input name="amountMax" inputMode="decimal" autoComplete="off" placeholder="0,00" className={control} />
        </label>
      </div>
      <fieldset className="flex flex-col gap-2 text-[14px] text-fg">
        <legend className="mb-1 text-[13px] font-medium text-fg-muted">Quando la regola trova un movimento</legend>
        <label className="flex min-h-10 items-center gap-2">
          <input type="radio" name="autoApply" value="yes" defaultChecked className="size-5 accent-[var(--fg)]" />
          Classificalo da solo
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="radio" name="autoApply" value="no" className="size-5 accent-[var(--fg)]" />
          Proponi soltanto: confermo io
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="h-11 rounded-full bg-fg px-6 text-sm font-semibold text-canvas disabled:opacity-50">
          {pending ? 'Salvo…' : 'Crea regola'}
        </button>
        <Message state={state} />
      </div>
    </form>
  )
}
