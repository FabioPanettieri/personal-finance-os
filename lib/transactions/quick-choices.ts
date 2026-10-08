/**
 * Scelte rapide per "sistemare" un movimento: poche opzioni comprensibili,
 * dipendenti dal segno dell'importo (un'uscita non può essere un'entrata).
 * I riferimenti sono per nome/percorso e si risolvono sui dati dell'utente.
 */
export type QuickChoice = {
  key: string
  label: string
  hint: string
  type: 'income' | 'expense' | 'transfer' | 'investment' | 'refund'
  nature: 'personal' | 'business' | 'investment' | 'transfer'
  categoryPath: string | null
  businessSlug: string | null
  incomeSourceName: string | null
  /** Raggruppamento visivo. */
  group: 'main' | 'category'
}

const c = (q: Omit<QuickChoice, 'group'> & { group?: QuickChoice['group'] }): QuickChoice => ({ group: 'main', ...q })

export const INCOME_CHOICES: readonly QuickChoice[] = [
  c({ key: 'salary', label: 'Stipendio', hint: 'Entrata personale', type: 'income', nature: 'personal', categoryPath: 'Stipendio', businessSlug: null, incomeSourceName: 'Stipendio' }),
  c({ key: 'voxel-sale', label: 'Vendita VOXEL Studio', hint: 'Entrata del business', type: 'income', nature: 'business', categoryPath: 'Vendite', businessSlug: 'voxel-studio', incomeSourceName: 'VOXEL Studio' }),
  c({ key: 'youtube', label: 'YouTube', hint: 'Il Progettista Meccanico', type: 'income', nature: 'business', categoryPath: 'YouTube', businessSlug: 'il-progettista-meccanico', incomeSourceName: 'YouTube — Il Progettista Meccanico' }),
  c({ key: 'refund', label: 'Rimborso', hint: 'Riduce le spese', type: 'refund', nature: 'personal', categoryPath: null, businessSlug: null, incomeSourceName: null }),
  c({ key: 'other-income', label: 'Altra entrata personale', hint: 'Regalo, vendita privata…', type: 'income', nature: 'personal', categoryPath: 'Altre entrate', businessSlug: null, incomeSourceName: 'Altri guadagni' }),
  c({ key: 'transfer-in', label: 'Dai miei conti', hint: 'Non è un’entrata: soldi spostati', type: 'transfer', nature: 'transfer', categoryPath: 'Trasferimenti > Giroconto', businessSlug: null, incomeSourceName: null }),
]

const SPENDING_CATEGORIES: [string, string][] = [
  ['Casa', 'Mutuo, bollette, manutenzione'],
  ['Alimentazione', 'Spesa, ristoranti, bar'],
  ['Trasporti', 'Carburante, auto, mezzi'],
  ['Shopping', 'Acquisti, abbigliamento'],
  ['Svago', 'Uscite, hobby, giochi'],
  ['Abbonamenti', 'Streaming, servizi'],
  ['Tecnologia', 'Hardware, software'],
  ['Salute', 'Farmacia, medico'],
  ['Altro', 'Tutto il resto'],
]

export const EXPENSE_CHOICES: readonly QuickChoice[] = [
  c({ key: 'voxel-expense', label: 'Spesa VOXEL Studio', hint: 'Materiali, spedizioni, software', type: 'expense', nature: 'business', categoryPath: 'Business > VOXEL Studio', businessSlug: 'voxel-studio', incomeSourceName: null }),
  c({ key: 'youtube-expense', label: 'Spesa YouTube', hint: 'Il Progettista Meccanico', type: 'expense', nature: 'business', categoryPath: 'Business > YouTube', businessSlug: 'il-progettista-meccanico', incomeSourceName: null }),
  c({ key: 'transfer-out', label: 'Verso i miei conti', hint: 'Non è una spesa: soldi spostati', type: 'transfer', nature: 'transfer', categoryPath: 'Trasferimenti > Giroconto', businessSlug: null, incomeSourceName: null }),
  c({ key: 'investment', label: 'Investimento', hint: 'Versamento al broker', type: 'investment', nature: 'investment', categoryPath: 'Investimenti > Versamenti', businessSlug: null, incomeSourceName: null }),
  ...SPENDING_CATEGORIES.map(([name, hint]) =>
    c({ key: `cat:${name}`, label: name, hint, type: 'expense', nature: 'personal', categoryPath: name, businessSlug: null, incomeSourceName: null, group: 'category' }),
  ),
]

export function choicesFor(amount: number): readonly QuickChoice[] {
  return amount > 0 ? INCOME_CHOICES : EXPENSE_CHOICES
}

export function findChoice(amount: number, key: string): QuickChoice | null {
  return choicesFor(amount).find((choice) => choice.key === key) ?? null
}
