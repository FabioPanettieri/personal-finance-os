import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Dati SINTETICI per i test della dashboard (integrazione ed E2E): quattro
 * mesi di movimenti su tutti i conti di default, con trasferimenti collegati
 * (ING → Revolut, ING → Conto Risparmio, ING → Carta, Revolut → Trade
 * Republic) e un acquisto di ETF. Inseriti con la secret key LOCALE solo per
 * preparare i test. I valori attesi sono calcolati a mano qui sotto.
 */

type Row = {
  account: AccountName
  on: string
  description: string
  amount: number
  type: 'income' | 'expense' | 'transfer' | 'investment' | 'refund'
  category?: string
  business?: string
  source?: string
  group?: string
  categorized?: boolean
}

type AccountName = 'ING Direct' | 'Revolut' | 'ING Conto Risparmio' | 'Carta di credito' | 'Trade Republic'

const ROWS: Row[] = [
  // Stipendio e spese di casa su ING
  ...['2026-07-27', '2026-08-27', '2026-09-27'].map((on) => ({ account: 'ING Direct' as const, on, description: 'Stipendio Azienda Esempio', amount: 165000, type: 'income' as const, category: 'Stipendio', source: 'Stipendio' })),
  ...['2026-07-05', '2026-08-05', '2026-09-05'].map((on) => ({ account: 'ING Direct' as const, on, description: 'Bolletta luce', amount: -12000, type: 'expense' as const, category: 'Casa > Bollette' })),
  ...['2026-07-10', '2026-08-10', '2026-09-10'].map((on) => ({ account: 'ING Direct' as const, on, description: 'Rata mutuo', amount: -60000, type: 'expense' as const, category: 'Casa > Mutuo' })),

  // Trasferimenti tra conti propri (due gambe, stesso gruppo)
  { account: 'ING Direct', on: '2026-08-01', description: 'Bonifico verso Revolut', amount: -30000, type: 'transfer', category: 'Trasferimenti > Giroconto', group: 'rev-aug' },
  { account: 'Revolut', on: '2026-08-01', description: 'Ricarica da ING', amount: 30000, type: 'transfer', category: 'Trasferimenti > Giroconto', group: 'rev-aug' },
  { account: 'ING Direct', on: '2026-09-01', description: 'Bonifico verso Revolut', amount: -30000, type: 'transfer', category: 'Trasferimenti > Giroconto', group: 'rev-sep' },
  { account: 'Revolut', on: '2026-09-01', description: 'Ricarica da ING', amount: 30000, type: 'transfer', category: 'Trasferimenti > Giroconto', group: 'rev-sep' },
  { account: 'ING Direct', on: '2026-09-15', description: 'Giroconto verso Conto Risparmio', amount: -50000, type: 'transfer', category: 'Trasferimenti > Giroconto', group: 'sav' },
  { account: 'ING Conto Risparmio', on: '2026-09-15', description: 'Giroconto da ING', amount: 50000, type: 'transfer', category: 'Trasferimenti > Giroconto', group: 'sav' },
  { account: 'ING Direct', on: '2026-09-10', description: 'Addebito carta di credito', amount: -40000, type: 'transfer', category: 'Trasferimenti > Giroconto', group: 'card' },
  { account: 'Carta di credito', on: '2026-09-10', description: 'Da ING Direct · Addebito carta di credito', amount: 40000, type: 'transfer', category: 'Trasferimenti > Giroconto', group: 'card' },
  { account: 'Revolut', on: '2026-09-22', description: 'Versamento Trade Republic', amount: -20000, type: 'investment', category: 'Investimenti > Versamenti', group: 'tr' },
  { account: 'Trade Republic', on: '2026-09-22', description: 'Versamento da Revolut', amount: 20000, type: 'investment', group: 'tr' },

  // Spese personali su Revolut
  { account: 'Revolut', on: '2026-08-03', description: 'Supermercato', amount: -8000, type: 'expense', category: 'Alimentazione > Spesa' },
  { account: 'Revolut', on: '2026-09-04', description: 'Supermercato', amount: -9500, type: 'expense', category: 'Alimentazione > Spesa' },
  { account: 'Revolut', on: '2026-10-02', description: 'Supermercato', amount: -4000, type: 'expense', category: 'Alimentazione > Spesa', categorized: false },
  { account: 'Revolut', on: '2026-09-20', description: 'Ristorante', amount: -3500, type: 'expense', category: 'Alimentazione > Ristorante' },
  { account: 'Revolut', on: '2026-09-25', description: 'Rimborso ordine online', amount: 2000, type: 'refund', category: 'Shopping > Acquisti online' },

  // Attività
  { account: 'Revolut', on: '2026-09-03', description: 'Etsy payout', amount: 12000, type: 'income', category: 'Vendite', business: 'voxel-studio', source: 'VOXEL Studio' },
  { account: 'Revolut', on: '2026-09-05', description: 'Packlink spedizione', amount: -1250, type: 'expense', category: 'Business > Spedizioni', business: 'voxel-studio' },
  { account: 'Revolut', on: '2026-09-15', description: 'Google Ireland AdSense', amount: 24500, type: 'income', category: 'YouTube', business: 'il-progettista-meccanico', source: 'YouTube — Il Progettista Meccanico' },
]

/** Valori attesi (centesimi), con oggi = 2026-10-03. */
export const EXPECTED = {
  netWorth: 291250,
  liquidity: 236250,
  investedAtCost: 15000,
  cards: 40000,
  balances: { 'ING Direct': 129000, Revolut: 52250, 'ING Conto Risparmio': 50000, 'Carta di credito': 40000, 'Trade Republic': 20000 },
  september: { income: 201500, expenses: 84250, cashFlow: 117250 },
  august: { income: 165000, expenses: 80000 },
  all: { income: 531500, expenses: 240250 },
  voxel: { revenue: 12000, expenses: 1250, profit: 10750 },
  youtube: { revenue: 24500, expenses: 0, profit: 24500 },
  firstDate: '2026-07-05',
  uncategorized: 1,
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedDashboard(admin: SupabaseClient<any>, userId: string): Promise<void> {
  const one = async <T>(promise: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> => {
    const { data, error } = await promise
    if (error) throw error
    return data as T
  }
  const accounts = await one<{ id: string; name: string }[]>(admin.from('accounts').select('id, name').eq('user_id', userId))
  const categories = await one<{ id: string; name: string; parent_id: string | null }[]>(
    admin.from('transaction_categories').select('id, name, parent_id').eq('user_id', userId),
  )
  const businesses = await one<{ id: string; slug: string }[]>(admin.from('businesses').select('id, slug').eq('user_id', userId))
  const sources = await one<{ id: string; name: string }[]>(admin.from('income_sources').select('id, name').eq('user_id', userId))

  const accountId = (name: string) => accounts.find((a) => a.name === name)!.id
  const categoryId = (path: string) => {
    const [parent, child] = path.split(' > ')
    const root = categories.find((c) => c.name === parent && c.parent_id === null)!
    return child ? categories.find((c) => c.name === child && c.parent_id === root.id)!.id : root.id
  }

  const groups = new Map<string, string>()
  for (const key of new Set(ROWS.map((r) => r.group).filter(Boolean) as string[])) {
    const group = await one<{ id: string }>(
      admin.from('transfer_groups').insert({ user_id: userId, kind: key === 'tr' ? 'investment' : 'internal', detected_by: 'auto', confidence: 0.95 }).select('id').single(),
    )
    groups.set(key, group.id)
  }

  await one(
    admin.from('transactions').insert(
      ROWS.map((r, i) => ({
        user_id: userId,
        account_id: accountId(r.account),
        booked_on: r.on,
        description: r.description,
        original_description: r.description.toUpperCase(),
        amount_cents: r.amount,
        currency: 'EUR',
        type: r.type,
        nature: r.type === 'transfer' ? 'transfer' : r.type === 'investment' ? 'investment' : r.business ? 'business' : 'personal',
        category_id: r.category ? categoryId(r.category) : null,
        business_id: r.business ? businesses.find((b) => b.slug === r.business)!.id : null,
        income_source_id: r.source ? sources.find((s) => s.name === r.source)!.id : null,
        transfer_group_id: r.group ? groups.get(r.group)! : null,
        is_categorized: r.categorized ?? true,
        categorization_method: 'rule',
        categorization_confidence: r.categorized === false ? 0.7 : 0.95,
        source: 'manual',
        fingerprint: sha(`dashboard-seed|${userId}|${i}`),
      })),
    ),
  )

  // Acquisto ETF: operazione su titoli (non è un movimento di cassa).
  const instrument = await one<{ id: string }>(
    admin.from('instruments').insert({ user_id: userId, isin: 'IE00B4L5Y983', name: 'ETF di esempio', asset_class: 'etf', currency: 'EUR' }).select('id').single(),
  )
  await one(
    admin.from('investment_transactions').insert({
      user_id: userId,
      account_id: accountId('Trade Republic'),
      instrument_id: instrument.id,
      trade_on: '2026-09-23',
      kind: 'buy',
      quantity: '1.5',
      price: '100',
      price_currency: 'EUR',
      amount_cents: -15000,
      fees_cents: 0,
      taxes_cents: 0,
      description: 'Acquisto ETF',
      original_description: 'ACQUISTO ETF',
      source: 'manual',
      fingerprint: sha(`dashboard-seed|${userId}|buy`),
    }),
  )
}
