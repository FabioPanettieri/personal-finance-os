/**
 * Obiettivi (Sprint 10). Il progresso è manuale (importo aggiornato a mano) o
 * collegato ai conti (somma delle quote dei saldi). Un saldo negativo non
 * conta come progresso. Con una scadenza: quanto serve al mese per arrivarci.
 */
import { compareIsoDates, isoDateParts, type IsoDate } from '../dates'

export type GoalLink = { accountId: string; balance: number; shareBps: number }

export type GoalInput = {
  targetCents: number
  tracking: 'manual' | 'linked_accounts'
  manualCents: number
  links: readonly GoalLink[]
  deadline: IsoDate | null
}

export type GoalStatus = 'achieved' | 'overdue' | 'active'

export type GoalProgress = {
  current: number
  remaining: number
  /** 0–1 (limitato a 1). */
  ratio: number
  status: GoalStatus
  /** Mesi interi rimasti fino alla scadenza (almeno 1 se la scadenza è futura). */
  monthsLeft: number | null
  /** Importo da mettere da parte ogni mese per arrivare alla scadenza. */
  monthlyNeeded: number | null
}

export function linkedAmount(links: readonly GoalLink[]): number {
  return links.reduce((sum, l) => sum + Math.round((Math.max(0, l.balance) * l.shareBps) / 10000), 0)
}

/** Mesi di calendario da oggi alla scadenza, contando il mese in corso se manca almeno un giorno. */
export function monthsUntil(today: IsoDate, deadline: IsoDate): number {
  const a = isoDateParts(today)
  const b = isoDateParts(deadline)
  const months = (b.year - a.year) * 12 + (b.month - a.month) + (b.day >= a.day ? 1 : 0)
  return Math.max(1, months)
}

export function goalProgress(goal: GoalInput, today: IsoDate): GoalProgress {
  const current = goal.tracking === 'manual' ? Math.max(0, goal.manualCents) : linkedAmount(goal.links)
  const remaining = Math.max(0, goal.targetCents - current)
  const ratio = goal.targetCents > 0 ? Math.min(1, current / goal.targetCents) : 0
  const achieved = remaining === 0
  const overdue = !achieved && goal.deadline !== null && compareIsoDates(goal.deadline, today) < 0
  const monthsLeft = goal.deadline && !overdue && !achieved ? monthsUntil(today, goal.deadline) : null
  return {
    current,
    remaining,
    ratio,
    status: achieved ? 'achieved' : overdue ? 'overdue' : 'active',
    monthsLeft,
    monthlyNeeded: monthsLeft ? Math.ceil(remaining / monthsLeft) : null,
  }
}
