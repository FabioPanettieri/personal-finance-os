'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'

import { signIn } from '../actions'
import { IDLE } from '../schemas'
import { AuthCard, FormMessage } from './auth-card'

export function LoginForm({ next, configIssue }: { next: string; configIssue: string[] | null }) {
  const [state, action, pending] = useActionState(signIn, IDLE)
  const disabled = configIssue !== null

  return (
    <AuthCard title="Accedi" description="Area privata. L’accesso è riservato al proprietario.">
      {configIssue ? (
        <div role="status" className="mb-5 rounded-[var(--radius-control)] border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-fg">
          <p className="font-medium">Supabase non configurato</p>
          <p className="mt-1 text-fg-muted">
            Imposta <code className="font-mono text-xs">{configIssue.join(', ')}</code> in <code className="font-mono text-xs">.env.local</code> (vedi <code className="font-mono text-xs">.env.example</code>).
          </p>
        </div>
      ) : null}

      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          defaultValue={state.email}
          required
          disabled={disabled}
          error={state.fieldErrors?.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={disabled}
          error={state.fieldErrors?.password}
        />
        <FormMessage message={state.message} />
        <Button type="submit" size="lg" loading={pending} disabled={disabled} className="mt-1 w-full">
          Accedi
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-fg-subtle">
        La registrazione pubblica è disattivata.
      </p>
    </AuthCard>
  )
}
