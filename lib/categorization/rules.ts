import type { ImportSource, TransactionNature, TransactionType } from '../imports/types'

/**
 * Forma comune delle regole: quelle salvate dall'utente in
 * `categorization_rules` (riferimenti per id) e quelle predefinite qui sotto
 * (riferimenti per nome, risolti per utente). Le regole sono dati: per
 * cambiare il comportamento si aggiunge o modifica una regola, non il codice.
 */
export type Rule = {
  id: string
  /** id in categorization_rules; null per le regole predefinite. */
  dbId: string | null
  name: string
  priority: number
  matchField: 'description' | 'counterparty'
  matchType: 'contains' | 'equals' | 'starts_with' | 'regex'
  pattern: string
  accountId: string | null
  direction: 'in' | 'out' | 'any'
  amountMinCents: number | null
  amountMaxCents: number | null
  /** Limita la regola ad alcune fonti (solo regole predefinite). */
  sources?: readonly ImportSource[]
  setType: TransactionType | null
  setNature: TransactionNature | null
  setCategoryId?: string | null
  setCategoryPath?: string
  setBusinessId?: string | null
  setBusinessSlug?: string
  setIncomeSourceId?: string | null
  setIncomeSourceName?: string
  confidence: number
  /** Riconosce il caso ma chiede revisione esplicita (nessun tipo assegnato). */
  review?: string
}

type DefaultRule = Omit<Rule, 'dbId' | 'accountId' | 'amountMinCents' | 'amountMaxCents' | 'matchField'> &
  Partial<Pick<Rule, 'matchField'>>

const d = (rule: DefaultRule): Rule => ({
  dbId: null,
  accountId: null,
  amountMinCents: null,
  amountMaxCents: null,
  matchField: 'description',
  ...rule,
})

/**
 * Regole predefinite (priorità 1000+, dopo quelle dell'utente). I pattern
 * lavorano sulla descrizione normalizzata: minuscole, senza accenti, solo
 * lettere/cifre separate da spazi.
 */
export const DEFAULT_RULES: readonly Rule[] = [
  // Entrate
  d({ id: 'default:stipendio', name: 'Stipendio', priority: 1000, matchType: 'regex', pattern: '\\b(stipendio|emolument[io]|salary|payroll|cedolino)\\b', direction: 'in', setType: 'income', setNature: 'personal', setCategoryPath: 'Stipendio', setIncomeSourceName: 'Stipendio', confidence: 0.85 }),
  d({ id: 'default:youtube', name: 'YouTube / AdSense', priority: 1010, matchType: 'regex', pattern: '\\b(youtube|adsense)\\b', direction: 'in', setType: 'income', setNature: 'business', setCategoryPath: 'YouTube', setIncomeSourceName: 'YouTube — Il Progettista Meccanico', setBusinessSlug: 'il-progettista-meccanico', confidence: 0.8 }),
  d({ id: 'default:voxel', name: 'VOXEL Studio', priority: 1020, matchType: 'regex', pattern: '\\bvoxel\\b', direction: 'in', setType: 'income', setNature: 'business', setCategoryPath: 'Vendite', setIncomeSourceName: 'VOXEL Studio', setBusinessSlug: 'voxel-studio', confidence: 0.8 }),
  d({ id: 'default:interessi', name: 'Interessi', priority: 1030, matchType: 'regex', pattern: '\\b(interessi|interest)\\b', direction: 'in', setType: 'income', setNature: 'personal', setCategoryPath: 'Interessi e dividendi', confidence: 0.8 }),
  d({ id: 'default:rimborso', name: 'Rimborso', priority: 1040, matchType: 'regex', pattern: '\\b(rimborso|refund|storno|reso)\\b', direction: 'in', setType: 'refund', setNature: 'personal', confidence: 0.8 }),

  // Trasferimenti tra conti propri (da confermare con la controparte)
  d({ id: 'default:verso-revolut', name: 'Bonifico verso Revolut', priority: 1100, matchType: 'regex', pattern: '\\brevolut\\b', direction: 'out', sources: ['ing'], setType: 'transfer', setNature: 'transfer', setCategoryPath: 'Trasferimenti > Giroconto', confidence: 0.75 }),
  d({ id: 'default:verso-ing', name: 'Trasferimento verso ING', priority: 1110, matchType: 'regex', pattern: '\\b(ing direct|ing bank|to ing|verso ing)\\b', direction: 'any', sources: ['revolut'], setType: 'transfer', setNature: 'transfer', setCategoryPath: 'Trasferimenti > Giroconto', confidence: 0.75 }),
  d({ id: 'default:giroconto', name: 'Giroconto', priority: 1120, matchType: 'regex', pattern: '\\b(giroconto|trasferimento tra conti)\\b', direction: 'any', setType: 'transfer', setNature: 'transfer', setCategoryPath: 'Trasferimenti > Giroconto', confidence: 0.75 }),

  // Casi che richiedono una decisione dell'utente
  d({ id: 'default:bonifico-ricevuto', name: 'Bonifico ricevuto', priority: 1200, matchType: 'regex', pattern: '\\b(bonifico ricevuto|bonifico a vostro favore|accredito bonifico)\\b', direction: 'in', setType: null, setNature: null, confidence: 0, review: 'Bonifico ricevuto: entrata o trasferimento da un tuo conto? Da verificare' }),
  d({ id: 'default:prelievo', name: 'Prelievo contanti', priority: 1210, matchType: 'regex', pattern: '\\b(prelievo|atm|cash at|bancomat)\\b', direction: 'out', setType: null, setNature: null, confidence: 0, review: 'Prelievo di contanti: spesa o trasferimento verso contanti? Da verificare' }),

  // Spese
  d({ id: 'default:mutuo', name: 'Mutuo', priority: 1300, matchType: 'regex', pattern: '\\b(mutuo|rata mutuo)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Casa > Mutuo', confidence: 0.9 }),
  d({ id: 'default:bollette', name: 'Bollette', priority: 1310, matchType: 'regex', pattern: '\\b(bolletta|enel|a2a|hera|iren|edison|acea|servizio idrico)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Casa > Bollette', confidence: 0.75 }),
  d({ id: 'default:supermercato', name: 'Supermercato', priority: 1320, matchType: 'regex', pattern: '\\b(supermarket|supermercato|esselunga|coop|conad|carrefour|lidl|eurospin|despar|aldi|iper|pam)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Alimentazione > Spesa', confidence: 0.8 }),
  d({ id: 'default:delivery', name: 'Delivery', priority: 1330, matchType: 'regex', pattern: '\\b(deliveroo|just eat|justeat|glovo|uber eats)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Alimentazione > Delivery', confidence: 0.85 }),
  d({ id: 'default:ristorante', name: 'Ristorante', priority: 1340, matchType: 'regex', pattern: '\\b(ristorante|restaurant|pizzeria|trattoria|osteria|sushi)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Alimentazione > Ristorante', confidence: 0.75 }),
  d({ id: 'default:bar', name: 'Bar', priority: 1350, matchType: 'regex', pattern: '\\b(bar|caffe|cafe|coffee)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Alimentazione > Bar', confidence: 0.65 }),
  d({ id: 'default:carburante', name: 'Carburante', priority: 1360, matchType: 'regex', pattern: '\\b(carburante|benzina|fuel|eni|q8|esso|tamoil|shell|ip station)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Trasporti > Carburante', confidence: 0.75 }),
  d({ id: 'default:trasporti', name: 'Trasporto pubblico', priority: 1370, matchType: 'regex', pattern: '\\b(trenitalia|italo|atm milano|metro|tper|flixbus)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Trasporti > Trasporto pubblico', confidence: 0.75 }),
  d({ id: 'default:parcheggio', name: 'Parcheggio', priority: 1380, matchType: 'regex', pattern: '\\b(parcheggio|parking|easypark|telepass)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Trasporti > Parcheggio', confidence: 0.75 }),
  d({ id: 'default:abbonamenti', name: 'Abbonamenti streaming', priority: 1390, matchType: 'regex', pattern: '\\b(spotify|netflix|disney|prime video|dazn|now tv)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Abbonamenti', confidence: 0.9 }),
  d({ id: 'default:digitale', name: 'Servizi digitali', priority: 1400, matchType: 'regex', pattern: '\\b(icloud|google storage|dropbox|github|adobe|notion|figma)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Tecnologia > Servizi digitali', confidence: 0.7 }),
  d({ id: 'default:acquisti-online', name: 'Acquisti online', priority: 1410, matchType: 'regex', pattern: '\\b(amazon|amzn|ebay|zalando)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Shopping > Acquisti online', confidence: 0.6 }),
  d({ id: 'default:salute', name: 'Salute', priority: 1420, matchType: 'regex', pattern: '\\b(farmacia|pharmacy|medico|ospedale|dentista)\\b', direction: 'out', setType: 'expense', setNature: 'personal', setCategoryPath: 'Salute', confidence: 0.75 }),
  d({ id: 'default:pagamento-pos', name: 'Pagamento POS generico', priority: 1900, matchType: 'regex', pattern: '\\b(pagamento|pos|card payment)\\b', direction: 'out', setType: 'expense', setNature: 'personal', confidence: 0.6 }),
]
