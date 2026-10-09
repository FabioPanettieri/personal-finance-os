/**
 * Osservazioni del report (Sprint 9). Regola: solo dati. Ogni frase nasce da
 * numeri calcolati sui movimenti e li riporta; senza dati sufficienti la frase
 * non compare (nessun confronto con un periodo vuoto, nessuna percentuale su zero).
 */
import { formatIsoDate, type IsoDate } from '../dates'
import { formatMoney, formatPercent, type Cents } from '../money'

export type CategoryAmount = { label: string; amount: number }

export type InsightInput = {
  currency: string
  income: number
  expenses: number
  count: number
  previous: { label: string; income: number; expenses: number; count: number } | null
  categories: readonly CategoryAmount[]
  previousCategories: readonly CategoryAmount[]
  biggestExpense: { description: string; amount: number; bookedOn: IsoDate } | null
  netWorth: { start: number | null; end: number | null }
  toReview: number
  ongoing: boolean
}

export type Insight = { key: string; tone: 'positive' | 'negative' | 'neutral' | 'warning'; text: string }

/** Variazione minima perché un confronto sia notevole. */
export const MIN_CHANGE_RATIO = 0.1
/** Variazione minima di una categoria (20 €). */
export const MIN_CATEGORY_DELTA = 2000

export function buildInsights(input: InsightInput): Insight[] {
  const money = (v: number) => formatMoney(v as Cents, { currency: input.currency })
  const signed = (v: number) => formatMoney(v as Cents, { currency: input.currency, signDisplay: 'exceptZero' })
  const out: Insight[] = []

  if (input.count === 0) {
    out.push({ key: 'empty', tone: 'neutral', text: 'Nessun movimento in questo periodo.' })
    return out
  }

  if (input.toReview > 0) {
    out.push({
      key: 'review',
      tone: 'warning',
      text: `${input.toReview === 1 ? '1 movimento da sistemare' : `${input.toReview} movimenti da sistemare`}: alcuni numeri potrebbero cambiare.`,
    })
  }

  if (input.income > 0) {
    const saved = input.income - input.expenses
    out.push(
      saved >= 0
        ? { key: 'saved', tone: 'positive', text: `Hai messo da parte ${money(saved)}: il ${formatPercent(saved / input.income)} delle entrate.` }
        : { key: 'saved', tone: 'negative', text: `Hai speso ${money(-saved)} più di quanto è entrato.` },
    )
  } else if (input.expenses > 0) {
    out.push({ key: 'saved', tone: 'neutral', text: `Nessuna entrata nel periodo; uscite per ${money(input.expenses)}.` })
  }

  const prev = input.previous
  if (prev && prev.count > 0) {
    if (prev.expenses > 0) {
      const ratio = (input.expenses - prev.expenses) / prev.expenses
      if (Math.abs(ratio) >= MIN_CHANGE_RATIO && !(input.ongoing && ratio < 0)) {
        out.push({
          key: 'expenses-change',
          tone: ratio > 0 ? 'negative' : 'positive',
          text: `Uscite ${ratio > 0 ? 'in aumento' : 'in calo'} del ${formatPercent(Math.abs(ratio))} rispetto a ${prev.label}: ${money(input.expenses)} contro ${money(prev.expenses)}.`,
        })
      }
    }
    if (prev.income > 0) {
      const ratio = (input.income - prev.income) / prev.income
      if (Math.abs(ratio) >= MIN_CHANGE_RATIO && !(input.ongoing && ratio < 0)) {
        out.push({
          key: 'income-change',
          tone: ratio > 0 ? 'positive' : 'negative',
          text: `Entrate ${ratio > 0 ? 'in aumento' : 'in calo'} del ${formatPercent(Math.abs(ratio))} rispetto a ${prev.label}: ${money(input.income)} contro ${money(prev.income)}.`,
        })
      }
    }
    const before = new Map(input.previousCategories.map((c) => [c.label, c.amount]))
    const deltas = input.categories.map((c) => ({ label: c.label, delta: c.amount - (before.get(c.label) ?? 0) }))
    const up = [...deltas].sort((a, b) => b.delta - a.delta)[0]
    if (up && up.delta >= MIN_CATEGORY_DELTA) {
      out.push({ key: 'category-up', tone: 'negative', text: `${up.label} è la voce cresciuta di più: ${signed(up.delta)} rispetto a ${prev.label}.` })
    }
    if (!input.ongoing) {
      const now = new Map(input.categories.map((c) => [c.label, c.amount]))
      const down = input.previousCategories
        .map((c) => ({ label: c.label, delta: (now.get(c.label) ?? 0) - c.amount }))
        .sort((a, b) => a.delta - b.delta)[0]
      if (down && down.delta <= -MIN_CATEGORY_DELTA) {
        out.push({ key: 'category-down', tone: 'positive', text: `${down.label} è la voce scesa di più: ${signed(down.delta)} rispetto a ${prev.label}.` })
      }
    }
  }

  const top = input.categories.filter((c) => c.amount > 0)[0]
  const positive = input.categories.reduce((s, c) => s + Math.max(0, c.amount), 0)
  if (top && positive > 0) {
    out.push({ key: 'top-category', tone: 'neutral', text: `La voce più pesante è ${top.label}: ${money(top.amount)}, il ${formatPercent(top.amount / positive)} delle uscite.` })
  }

  if (input.biggestExpense) {
    const b = input.biggestExpense
    out.push({ key: 'biggest', tone: 'neutral', text: `Spesa più grande: ${b.description} il ${formatIsoDate(b.bookedOn)} (${money(-b.amount)}).` })
  }

  const { start, end } = input.netWorth
  if (start !== null && end !== null && start !== end) {
    out.push({
      key: 'net-worth',
      tone: end > start ? 'positive' : 'negative',
      text: `Il patrimonio è passato da ${money(start)} a ${money(end)} (${signed(end - start)}).`,
    })
  }
  return out
}
