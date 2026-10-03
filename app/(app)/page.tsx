import { ArrowDownLeft, ArrowUpRight, FileUp, LineChart, PiggyBank } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiCard } from '@/components/ui/kpi-card'
import { PageHeader } from '@/components/ui/page-header'

export const metadata: Metadata = { title: 'Home' }

/**
 * Dashboard — Sprint 1: struttura e stati vuoti. Nessun numero viene
 * mostrato finché non esistono dati importati (Sprint 3) e l'analytics
 * engine (Sprint 6): "—" significa "nessun dato", non zero.
 */
export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Home" description="La tua situazione finanziaria in un colpo d’occhio." />

      <Card className="mb-4 lg:mb-6">
        <p className="text-[12px] font-medium tracking-wider text-fg-muted uppercase">Patrimonio totale</p>
        <p className="mt-2 text-4xl font-semibold tracking-[-0.03em] text-fg-subtle tabular lg:text-5xl">—</p>
        <p className="mt-2 text-sm text-fg-muted">Disponibile dopo la prima importazione.</p>
      </Card>

      <section aria-label="Indicatori del mese" className="mb-4 grid grid-cols-2 gap-3 lg:mb-6 lg:grid-cols-4 lg:gap-4">
        <KpiCard label="Entrate" value={null} icon={ArrowDownLeft} />
        <KpiCard label="Spese" value={null} icon={ArrowUpRight} />
        <KpiCard label="Risparmio" value={null} icon={PiggyBank} />
        <KpiCard label="Investimenti" value={null} icon={LineChart} />
      </section>

      <EmptyState
        icon={FileUp}
        title="Nessun movimento ancora"
        description="Importa i CSV di ING, Revolut e Trade Republic per costruire la tua base dati. L’importazione arriva nello Sprint 3."
        action={
          <Link href="/imports" className="text-sm font-medium text-accent hover:underline">
            Vai alle importazioni
          </Link>
        }
      />
    </>
  )
}
