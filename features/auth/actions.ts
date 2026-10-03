'use server'

import { redirect } from 'next/navigation'

import { ROUTES, safeNextPath } from '@/lib/auth/access'
import { getSupabaseConfig } from '@/lib/env'
import { requireSession } from '@/server/auth/session'
import { createSupabaseServerClient } from '@/server/supabase/server'

import {
  fieldErrorsFrom,
  loginSchema,
  totpCodeSchema,
  totpEnrollVerifySchema,
  type FormState,
} from './schemas'

const NOT_CONFIGURED: FormState = {
  status: 'error',
  message: 'Supabase non è configurato: imposta le variabili d’ambiente (vedi .env.example).',
}

/**
 * Login email + password. Nessuna registrazione: l'utente esiste solo se
 * creato dal proprietario in Supabase. Il messaggio d'errore è volutamente
 * generico (non rivela se l'email esiste).
 */
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!getSupabaseConfig().configured) return NOT_CONFIGURED

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })
  const email = typeof formData.get('email') === 'string' ? String(formData.get('email')).slice(0, 254) : ''
  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsFrom(parsed.error), email }
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    if (error.status === 429) {
      return { status: 'error', message: 'Troppi tentativi. Riprova tra qualche minuto.', email }
    }
    return { status: 'error', message: 'Email o password non corretti.', email }
  }

  // Dopo la password la sessione è AAL1: si va direttamente al passaggio TOTP.
  // (Reindirizzare all'area app lascerebbe al layout un secondo redirect durante
  // il render dell'action, e il browser resterebbe sull'URL sbagliato.)
  const hasVerifiedTotp = data.user.factors?.some((f) => f.factor_type === 'totp' && f.status === 'verified') ?? false
  redirect(mfaUrl(hasVerifiedTotp ? ROUTES.mfaVerify : ROUTES.mfaSetup, parsed.data.next))
}

/** Porta con sé la destinazione originale attraverso il passaggio MFA. */
function mfaUrl(step: string, next: string | undefined | null): string {
  const safe = safeNextPath(next)
  return safe === ROUTES.home ? step : `${step}?next=${encodeURIComponent(safe)}`
}

function nextFrom(formData: FormData): string {
  const value = formData.get('next')
  return safeNextPath(typeof value === 'string' ? value : null)
}

export async function signOut(): Promise<never> {
  if (getSupabaseConfig().configured) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut({ scope: 'local' })
  }
  redirect(ROUTES.login)
}

export type TotpEnrollment = {
  factorId: string
  qrCode: string
  secret: string
}

export type EnrollState = FormState & { enrollment?: TotpEnrollment }

/** Avvia la registrazione TOTP, eliminando eventuali tentativi non completati. */
export async function startTotpEnrollment(): Promise<EnrollState> {
  await requireSession()
  const supabase = await createSupabaseServerClient()

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
  if (listError) return { status: 'error', message: 'Impossibile leggere i fattori di autenticazione.' }

  if (factors.totp.length > 0) {
    // Esiste già un fattore verificato: va usato, non sostituito.
    redirect(ROUTES.mfaVerify)
  }

  for (const factor of factors.all) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Personal Finance OS',
  })
  if (error) return { status: 'error', message: 'Impossibile avviare la configurazione. Riprova.' }

  return {
    status: 'idle',
    enrollment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
  }
}

export async function confirmTotpEnrollment(prev: EnrollState, formData: FormData): Promise<EnrollState> {
  await requireSession()

  const parsed = totpEnrollVerifySchema.safeParse({
    code: formData.get('code'),
    factorId: formData.get('factorId'),
  })
  if (!parsed.success) {
    return { ...prev, status: 'error', message: undefined, fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  })
  if (error) {
    return { ...prev, status: 'error', fieldErrors: undefined, message: 'Codice non valido o scaduto.' }
  }

  redirect(nextFrom(formData))
}

export async function verifyTotp(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession()

  const parsed = totpCodeSchema.safeParse({ code: formData.get('code') })
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrorsFrom(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
  const factor = factors?.totp[0]
  if (listError || !factor) redirect(ROUTES.mfaSetup)

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data.code })
  if (error) return { status: 'error', message: 'Codice non valido o scaduto.' }

  redirect(nextFrom(formData))
}
