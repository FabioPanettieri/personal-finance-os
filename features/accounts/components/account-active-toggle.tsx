'use client'

import { Power } from 'lucide-react'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'

import { setAccountActiveAction, type AccountFormState } from '../actions'

const INITIAL: AccountFormState = { status: 'idle' }

export function AccountActiveToggle({ accountId, isActive }: { accountId: string; isActive: boolean }) {
  const [state, action, pending] = useActionState(setAccountActiveAction.bind(null, accountId, !isActive), INITIAL)

  return (
    <form action={action} className="flex flex-col gap-2">
      <p className="text-sm text-fg-muted">
        {isActive
          ? 'Un conto disattivato resta nello storico e nei totali, ma non viene proposto per nuove importazioni.'
          : 'Il conto è disattivato: resta nello storico e nei totali. Riattivalo per usarlo nelle importazioni.'}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={isActive ? 'secondary' : 'primary'} loading={pending} className="min-h-11">
          <Power aria-hidden className="size-4" />
          {isActive ? 'Disattiva conto' : 'Riattiva conto'}
        </Button>
        {state.status === 'error' ? (
          <p role="alert" className="text-sm text-negative">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  )
}
