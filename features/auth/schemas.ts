import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email({ error: 'Inserisci un indirizzo email valido' }).max(254),
  password: z.string().min(1, { error: 'Inserisci la password' }).max(256),
  next: z.string().max(2048).optional(),
})

export const totpCodeSchema = z.object({
  code: z
    .string()
    .transform((value) => value.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, { error: 'Il codice è composto da 6 cifre' })),
})

export const totpEnrollVerifySchema = totpCodeSchema.extend({
  factorId: z.string().min(1).max(64),
})

export type FormState = {
  status: 'idle' | 'error'
  message?: string
  fieldErrors?: Partial<Record<string, string>>
  /** Email inviata, per ripresentarla dopo un errore (React 19 azzera il form). Mai la password. */
  email?: string
}

export const IDLE: FormState = { status: 'idle' }

export function fieldErrorsFrom(error: z.ZodError): Partial<Record<string, string>> {
  const result: Partial<Record<string, string>> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    result[key] ??= issue.message
  }
  return result
}
