'use client'

import { Check } from 'lucide-react'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/utils/cn'

import { updateAccountAction, type AccountFormState } from '../actions'
import { ACCOUNT_COLORS } from '../schemas'

export type AccountEditValues = {
  name: string
  institution: string
  color: string | null
  initialBalance: string
  initialBalanceOn: string
  currency: string
}

const INITIAL: AccountFormState = { status: 'idle' }

export function AccountEditForm({ accountId, values }: { accountId: string; values: AccountEditValues }) {
  const [state, action, pending] = useActionState(updateAccountAction.bind(null, accountId), INITIAL)
  const errors = state.fieldErrors
  // Dopo un errore il form mostra ciò che l'utente aveva scritto, non i valori salvati.
  const current = state.values ?? {
    name: values.name,
    institution: values.institution,
    color: values.color ?? '',
    initialBalance: values.initialBalance,
    initialBalanceOn: values.initialBalanceOn,
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" name="name" defaultValue={current.name} required maxLength={60} error={errors?.name} />
        <Field
          label="Istituto"
          name="institution"
          defaultValue={current.institution}
          maxLength={80}
          error={errors?.institution}
        />
        <Field
          label={`Saldo iniziale (${values.currency})`}
          name="initialBalance"
          defaultValue={current.initialBalance}
          inputMode="decimal"
          autoComplete="off"
          hint="Formato 1.234,56 — il saldo all’inizio della data indicata."
          error={errors?.initialBalance}
        />
        <Field
          label="Data del saldo iniziale"
          name="initialBalanceOn"
          type="date"
          defaultValue={current.initialBalanceOn}
          hint="Vuota: conta tutti i movimenti."
          error={errors?.initialBalanceOn}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-fg">Colore</legend>
        <div className="flex flex-wrap gap-1">
          {ACCOUNT_COLORS.map((color) => (
            <label key={color} className="relative grid size-11 cursor-pointer place-items-center rounded-full">
              <input
                type="radio"
                name="color"
                value={color}
                defaultChecked={current.color.toLowerCase() === color.toLowerCase()}
                className="peer sr-only"
              />
              <span className="sr-only">Colore {color}</span>
              <span
                aria-hidden
                className={cn(
                  'grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-surface',
                  'peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent',
                  '[&>svg]:hidden peer-checked:[&>svg]:block',
                )}
                style={{ backgroundColor: color }}
              >
                <Check className="size-4 text-white" />
              </span>
            </label>
          ))}
        </div>
        {errors?.color ? <p className="mt-1 text-xs text-negative">{errors.color}</p> : null}
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <Button type="submit" loading={pending} className="min-h-11 sm:w-auto">
          Salva modifiche
        </Button>
        <p role="status" aria-live="polite" className={cn('text-sm', state.status === 'error' ? 'text-negative' : 'text-positive')}>
          {state.message}
        </p>
      </div>
    </form>
  )
}
