import { z } from 'zod'

export const sourceSchema = z.enum(['ing', 'revolut', 'trade_republic'])

export const createImportSchema = z.object({
  source: sourceSchema,
  accountId: z.uuid({ error: 'Scegli il conto' }),
})

const optionalUuid = z
  .string()
  .transform((value) => (value === '' ? null : value))
  .refine((value) => value === null || z.uuid().safeParse(value).success, { error: 'Valore non valido' })

export const rowPatchSchema = z.object({
  type: z.enum(['income', 'expense', 'transfer', 'investment', 'refund'], { error: 'Scegli il tipo' }),
  categoryId: optionalUuid,
  businessId: optionalUuid,
  incomeSourceId: optionalUuid,
  transferAccountId: optionalUuid,
})

export const idSchema = z.uuid()
