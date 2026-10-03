import { z } from 'zod'

import { isIsoDate, type IsoDate } from '@/lib/dates'
import { parseAmountInput } from '@/lib/money/parse'
import type { Cents } from '@/lib/money'

/** Colori proposti per i conti (token neutri e desaturati del design system). */
export const ACCOUNT_COLORS = [
  '#FF6200',
  '#4F5BD5',
  '#1F2937',
  '#30A46C',
  '#0090FF',
  '#8E4EC6',
  '#E5484D',
  '#12A594',
  '#8B8D98',
] as const

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Massimo ${max} caratteri` })
    .transform((value) => (value === '' ? null : value))

export const accountUpdateSchema = z.object({
  name: z.string().trim().min(1, { error: 'Il nome è obbligatorio' }).max(60, { error: 'Massimo 60 caratteri' }),
  institution: optionalText(80),
  color: z
    .string()
    .transform((value) => (value === '' ? null : value))
    .refine((value) => value === null || /^#[0-9a-fA-F]{6}$/.test(value), { error: 'Colore non valido' }),
  initialBalance: z.string().transform((value, ctx): Cents => {
    const parsed = parseAmountInput(value)
    if (!parsed.ok) {
      ctx.addIssue({ code: 'custom', message: parsed.error })
      return z.NEVER
    }
    return parsed.value
  }),
  initialBalanceOn: z
    .string()
    .transform((value) => (value === '' ? null : value))
    .refine((value) => value === null || isIsoDate(value), { error: 'Data non valida' })
    .transform((value) => value as IsoDate | null),
})

export type AccountUpdateInput = z.output<typeof accountUpdateSchema>

export const accountIdSchema = z.uuid()
