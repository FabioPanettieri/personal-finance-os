'use client'

import { ShieldCheck } from 'lucide-react'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'

import { confirmTotpEnrollment, startTotpEnrollment, type EnrollState } from '../actions'
import { AuthCard, FormMessage } from './auth-card'

const INITIAL: EnrollState = { status: 'idle' }

export function MfaSetupForm({ next }: { next: string }) {
  const [startState, start, starting] = useActionState(startTotpEnrollment, INITIAL)
  const [confirmState, confirm, confirming] = useActionState(confirmTotpEnrollment, INITIAL)
  const enrollment = startState.enrollment

  return (
    <AuthCard
      title="Verifica in due passaggi"
      description="Obbligatoria per proteggere i tuoi dati finanziari. Usa un’app di autenticazione (1Password, Google Authenticator, Authy…)."
    >
      {!enrollment ? (
        <form action={start} className="flex flex-col gap-4">
          <FormMessage message={startState.message} />
          <Button type="submit" size="lg" loading={starting} className="w-full">
            <ShieldCheck aria-hidden className="size-4" />
            Configura l’app di autenticazione
          </Button>
        </form>
      ) : (
        <form action={confirm} className="flex flex-col gap-5">
          <ol className="flex flex-col gap-4 text-sm text-fg-muted">
            <li>
              <span className="font-medium text-fg">1.</span> Inquadra il codice QR con l’app.
              <div className="mt-3 grid place-items-center rounded-[var(--radius-control)] bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URI SVG generato da Supabase, non ottimizzabile */}
                <img src={enrollment.qrCode} alt="Codice QR per l’app di autenticazione" width={176} height={176} />
              </div>
              <p className="mt-3">
                Oppure inserisci la chiave:{' '}
                <code className="font-mono text-xs break-all text-fg select-all">{enrollment.secret}</code>
              </p>
            </li>
            <li>
              <span className="font-medium text-fg">2.</span> Inserisci il codice a 6 cifre mostrato dall’app.
            </li>
          </ol>
          <input type="hidden" name="factorId" value={enrollment.factorId} />
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
            error={confirmState.fieldErrors?.code}
          />
          <FormMessage message={confirmState.message} />
          <Button type="submit" size="lg" loading={confirming} className="w-full">
            Attiva e continua
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
