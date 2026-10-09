import type { IsoDate } from '@/lib/dates'
import { goalProgress, type GoalProgress } from '@/lib/goals/progress'
import { listAccounts, type DbClient } from '@/server/repositories/accounts'
import { listGoals, type Goal } from '@/server/repositories/goals'

export type GoalView = Goal & { progress: GoalProgress; accountNames: string[] }

/** Obiettivi con il progresso calcolato dai saldi attuali (account_balances). */
export async function loadGoals(db: DbClient, today: IsoDate, { archived = false } = {}): Promise<GoalView[]> {
  const [goals, accounts] = await Promise.all([listGoals(db, { archived }), listAccounts(db)])
  const byId = new Map(accounts.map((a) => [a.id, a]))
  return goals.map((g) => ({
    ...g,
    accountNames: g.links.map((l) => byId.get(l.accountId)?.name ?? 'Conto'),
    progress: goalProgress(
      {
        targetCents: g.targetCents,
        tracking: g.tracking,
        manualCents: g.manualCents,
        deadline: g.deadline,
        links: g.links.map((l) => ({ accountId: l.accountId, shareBps: l.shareBps, balance: byId.get(l.accountId)?.balance ?? 0 })),
      },
      today,
    ),
  }))
}
