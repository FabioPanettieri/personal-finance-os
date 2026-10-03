'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'

import { confirmTransactionAction, type ConfirmState } from '../actions'

export function ConfirmButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(confirmTransactionAction.bind(null, id), { status: 'idle' } as ConfirmState)
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" loading={pending} className="min-h-11">
        Conferma classificazione
      </Button>
      {state.message ? (
        <p role="status" className={state.status === 'error' ? 'text-sm text-negative' : 'text-sm text-positive'}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
