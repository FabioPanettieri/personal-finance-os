'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { SignOutButton } from '@/components/layout/user-menu'

import { verifyTotp } from '../actions'
import { IDLE } from '../schemas'
import { AuthCard, FormMessage } from './auth-card'

export function MfaVerifyForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifyTotp, IDLE)

  return (
    <AuthCard title="Verifica in due passaggi" description="Inserisci il codice a 6 cifre della tua app di autenticazione.">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <Field
          label="Codice di verifica"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus
          error={state.fieldErrors?.code}
        />
        <FormMessage message={state.message} />
        <Button type="submit" size="lg" loading={pending} className="w-full">
          Verifica
        </Button>
      </form>
      <div className="mt-4 flex justify-center">
        <SignOutButton />
      </div>
    </AuthCard>
  )
}
