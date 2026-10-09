import { Target } from 'lucide-react'
import type { Metadata } from 'next'

import { Money } from '@/components/ui/money'
import { GoalSummary } from '@/features/goals/components/goal-card'
import { AddToGoal, GoalForm, GoalMenu } from '@/features/goals/components/forms'
import { DEFAULT_TIME_ZONE, today } from '@/lib/dates'
import type { Cents } from '@/lib/money'
import { getProfile, requireUser } from '@/server/auth/session'
import { listAccounts } from '@/server/repositories/accounts'
import { loadGoals } from '@/server/services/goals'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Obiettivi' }

/** Obiettivi di risparmio: progresso a mano o dai saldi dei conti, scadenze, quanto serve al mese. */
export default async function GoalsPage() {
  await requireUser('/goals')
  const profile = await getProfile()
  const now = today(profile?.timezone ?? DEFAULT_TIME_ZONE)
  const db = await createSupabaseServerClient()
  const [goals, archived, accounts] = await Promise.all([loadGoals(db, now), loadGoals(db, now, { archived: true }), listAccounts(db)])
  const options = accounts.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name }))
  const monthly = goals.reduce((s, g) => s + (g.progress.status === 'active' ? (g.progress.monthlyNeeded ?? 0) : 0), 0)

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg lg:text-[30px]">Obiettivi</h1>
        <p className="mt-1 text-[15px] text-fg-muted">
          {monthly > 0 ? (
            <>
              Per stare nei tempi metti da parte <Money value={monthly as Cents} currency="EUR" className="font-semibold text-fg" /> al mese.
            </>
          ) : (
            'Per cosa stai mettendo da parte i soldi?'
          )}
        </p>
      </header>

      {goals.length === 0 ? (
        <div className="mb-6 flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-10 text-center">
          <Target aria-hidden className="size-8 text-fg-muted" />
          <p className="text-base font-semibold text-fg">Nessun obiettivo</p>
          <p className="text-sm text-fg-muted">Crea il primo qui sotto: un fondo emergenze, una vacanza, un acquisto per VOXEL Studio.</p>
        </div>
      ) : (
        <ul aria-label="Obiettivi" className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {goals.map((g) => (
            <li key={g.id} data-testid={`goal-${g.name}`} className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
              <GoalSummary goal={g} />
              {g.tracking === 'manual' && g.progress.status !== 'achieved' ? <AddToGoal id={g.id} name={g.name} /> : null}
              <div className="flex items-center justify-between gap-2">
                <details className="min-w-0 flex-1">
                  <summary className="cursor-pointer text-[13px] font-semibold text-fg-muted">Modifica</summary>
                  <div className="mt-3">
                    <GoalForm
                      id={g.id}
                      accounts={options}
                      values={{ name: g.name, targetCents: g.targetCents, manualCents: g.manualCents, deadline: g.deadline, tracking: g.tracking, links: g.links }}
                    />
                  </div>
                </details>
                <GoalMenu id={g.id} name={g.name} archived={false} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="new-goal" className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
        <h2 id="new-goal" className="mb-4 text-[17px] font-semibold text-fg">
          Nuovo obiettivo
        </h2>
        <GoalForm accounts={options} />
      </section>

      {archived.length > 0 ? (
        <section aria-labelledby="archived-goals">
          <h2 id="archived-goals" className="mb-3 text-[15px] font-semibold text-fg-muted">
            Archiviati · {archived.length}
          </h2>
          <ul className="flex flex-col gap-2">
            {archived.map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 opacity-80">
                <div className="min-w-0 flex-1">
                  <GoalSummary goal={g} compact />
                </div>
                <GoalMenu id={g.id} name={g.name} archived />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
