import { ArrowLeft, ArrowLeftRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { ConfirmButton } from '@/features/transactions/components/confirm-button'
import { METHOD_LABELS, NATURE_LABELS, SOURCE_LABELS, TYPE_LABELS } from '@/features/transactions/labels'
import { formatIsoDate } from '@/lib/dates'
import { formatPercent } from '@/lib/money'
import { requireUser } from '@/server/auth/session'
import { getTransaction } from '@/server/repositories/transactions'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Movimento' }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2.5 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children ?? <span className="text-fg-subtle">—</span>}</dd>
    </div>
  )
}

/** Dettaglio di un movimento. L'IBAN della controparte è mostrato mascherato. */
export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireUser(`/transactions/${id}`)
  if (!z.uuid().safeParse(id).success) notFound()
  const t = await getTransaction(await createSupabaseServerClient(), id)
  if (!t) notFound()
  const internal = t.type === 'transfer' || t.type === 'investment'

  return (
    <>
      <Link href="/transactions" className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" />
        Transazioni
      </Link>

      <header className="mb-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={internal ? 'neutral' : t.type === 'income' || t.type === 'refund' ? 'positive' : 'accent'}>{TYPE_LABELS[t.type]}</Badge>
          {!t.isCategorized ? <Badge tone="warning">Da verificare</Badge> : null}
        </div>
        <h1 className="text-xl font-semibold tracking-[-0.01em] break-words text-fg lg:text-2xl">{t.description}</h1>
        <Money
          value={t.amount}
          currency={t.currency}
          signDisplay="exceptZero"
          tone={internal ? 'none' : 'signed'}
          emphasizeUnits
          className="text-3xl font-semibold tracking-[-0.02em] lg:text-4xl"
        />
      </header>

      {!t.isCategorized ? (
        <Card className="mb-4 flex flex-col gap-3 lg:mb-6">
          <p className="text-sm text-fg-muted">
            Classificazione proposta {t.ruleName ? `dalla regola “${t.ruleName}”` : 'automaticamente'}
            {t.confidence !== null ? ` con confidenza ${formatPercent(t.confidence)}` : ''}: confermala se è corretta.
          </p>
          <ConfirmButton id={t.id} />
        </Card>
      ) : null}

      <Card className="mb-4 lg:mb-6">
        <dl className="divide-y divide-line">
          <Row label="Data">{formatIsoDate(t.bookedOn, 'long')}</Row>
          {t.valueOn && t.valueOn !== t.bookedOn ? <Row label="Data valuta">{formatIsoDate(t.valueOn, 'long')}</Row> : null}
          <Row label="Conto">
            <Link href={`/accounts/${t.account.id}`} className="text-accent hover:underline">{t.account.name}</Link>
          </Row>
          <Row label="Tipo">{TYPE_LABELS[t.type]}</Row>
          <Row label="Natura">{NATURE_LABELS[t.nature] ?? t.nature}</Row>
          <Row label="Categoria">{t.category}</Row>
          <Row label="Business">{t.business}</Row>
          <Row label="Fonte di reddito">{t.incomeSource}</Row>
          <Row label="Controparte">{t.counterparty}</Row>
          <Row label="IBAN controparte">{t.counterpartyIbanMasked ? <span className="tabular">{t.counterpartyIbanMasked}</span> : null}</Row>
          <Row label="Classificazione">
            {METHOD_LABELS[t.method] ?? t.method}
            {t.confidence !== null ? ` · confidenza ${formatPercent(t.confidence)}` : ''}
            {t.ruleName ? ` · regola “${t.ruleName}”` : ''}
          </Row>
          <Row label="Origine">
            {SOURCE_LABELS[t.source] ?? t.source}
            {t.importInfo ? (
              <>
                {' · '}
                <Link href={`/imports/${t.importInfo.id}`} className="text-accent hover:underline">
                  importazione {SOURCE_LABELS[t.importInfo.bankProfile] ?? t.importInfo.bankProfile}
                </Link>
              </>
            ) : null}
          </Row>
          <Row label="Descrizione originale">
            <span className="text-fg-muted">{t.originalDescription}</span>
          </Row>
        </dl>
      </Card>

      {internal ? (
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-wide text-fg-muted uppercase">
            <ArrowLeftRight aria-hidden className="size-4" /> Trasferimento
          </h2>
          {t.transferLegs.length > 0 ? (
            <ul className="divide-y divide-line">
              {t.transferLegs.map((leg) => (
                <li key={leg.id}>
                  <Link href={`/transactions/${leg.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent">
                    <span>
                      {leg.accountName} · {formatIsoDate(leg.bookedOn)}
                    </span>
                    <Money value={leg.amount} currency={t.currency} signDisplay="exceptZero" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">
              Controparte non ancora collegata: verrà riconosciuta importando l’estratto dell’altro conto. Non è contato come entrata né come spesa.
            </p>
          )}
        </Card>
      ) : null}
    </>
  )
}
