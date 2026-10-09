import { ArrowLeft, ArrowLeftRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { z } from 'zod'

import { Money } from '@/components/ui/money'
import { EditDetails } from '@/features/transactions/components/edit-details'
import { QuickClassify } from '@/features/transactions/components/quick-classify'
import { TransferCandidates, UnlinkTransferButton } from '@/features/transactions/components/transfer-actions'
import { NATURE_LABELS, SOURCE_LABELS, TYPE_LABELS } from '@/features/transactions/labels'
import { accountColor } from '@/lib/banks'
import { formatIsoDate } from '@/lib/dates'
import { choicesFor } from '@/lib/transactions/quick-choices'
import { cn } from '@/lib/utils/cn'
import { requireUser } from '@/server/auth/session'
import { businessList, incomeSourceList } from '@/server/repositories/dashboard'
import { categoryKindFor, editableCategories, getTransaction } from '@/server/repositories/transactions'
import { transferCandidates } from '@/server/repositories/transfers'
import { createSupabaseServerClient } from '@/server/supabase/server'

export const metadata: Metadata = { title: 'Movimento' }

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-[15px]">
      <dt className="shrink-0 text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-right break-words text-fg">{children}</dd>
    </div>
  )
}

/** Dettaglio di un movimento e "Sistema" a due tocchi. L'IBAN della controparte è mascherato. */
export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireUser(`/transactions/${id}`)
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createSupabaseServerClient()
  const t = await getTransaction(db, id)
  if (!t) notFound()
  const [candidates, categories, businesses, sources] = await Promise.all([
    t.transferGroupId ? [] : transferCandidates(db, t.id),
    editableCategories(db),
    businessList(db),
    incomeSourceList(db),
  ])
  const internal = t.type === 'transfer' || t.type === 'investment'
  const color = accountColor({ name: t.account.name, institution: t.account.institution })
  const currentLabel = [TYPE_LABELS[t.type], t.business ?? t.category].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/transactions" className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" />
        Movimenti
      </Link>

      <header className="mb-6 flex flex-col items-center gap-2 text-center">
        <span aria-hidden className="mb-1 h-1.5 w-12 rounded-full" style={{ background: color }} />
        <h1 className="text-xl font-semibold break-words text-fg">{t.description}</h1>
        <Money
          value={t.amount}
          currency={t.currency}
          signDisplay={internal ? 'never' : 'exceptZero'}
          emphasizeUnits
          className={cn('text-[40px] font-bold tracking-[-0.03em]', internal ? 'text-fg' : t.amount > 0 ? 'text-positive' : 'text-fg')}
        />
        <p className="text-sm text-fg-muted">
          {t.account.name} · {formatIsoDate(t.bookedOn, 'long')}
        </p>
      </header>

      {!t.isCategorized ? (
        <section aria-label="Sistema il movimento" className="mb-6 rounded-[var(--radius-card)] border border-warning/40 bg-surface p-5">
          <p className="mb-4 text-sm text-fg-muted">
            {t.ruleName ? `Proposta automatica (regola “${t.ruleName}”): ` : 'Proposta automatica: '}
            <span className="font-medium text-fg">{currentLabel}</span>
          </p>
          <QuickClassify id={t.id} choices={choicesFor(t.amount)} current={currentLabel} canConfirmCurrent />
        </section>
      ) : null}

      <section aria-label="Dettagli" className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface px-5">
        <dl className="divide-y divide-line">
          <Row label="Tipo">{TYPE_LABELS[t.type]}</Row>
          <Row label="Natura">{NATURE_LABELS[t.nature] ?? t.nature}</Row>
          <Row label="Categoria">{t.category}</Row>
          <Row label="Business">{t.business}</Row>
          <Row label="Fonte di reddito">{t.incomeSource}</Row>
          <Row label="Controparte">{t.counterparty}</Row>
          <Row label="IBAN controparte">{t.counterpartyIbanMasked ? <span className="tabular">{t.counterpartyIbanMasked}</span> : null}</Row>
          <Row label="Conto">
            <Link href={`/accounts/${t.account.id}`} className="font-medium hover:underline">
              {t.account.name}
            </Link>
          </Row>
          <Row label="Origine">
            {SOURCE_LABELS[t.source] ?? t.source}
            {t.importInfo ? (
              <>
                {' · '}
                <Link href={`/imports/${t.importInfo.id}`} className="font-medium hover:underline">
                  {SOURCE_LABELS[t.importInfo.bankProfile] ?? t.importInfo.bankProfile}
                </Link>
              </>
            ) : null}
          </Row>
          <Row label="Note">{t.notes ? <span className="whitespace-pre-line">{t.notes}</span> : null}</Row>
          <Row label="Testo della banca">
            <span className="text-sm text-fg-muted">{t.originalDescription}</span>
          </Row>
        </dl>
      </section>

      {internal || candidates.length > 0 ? (
        <section aria-label="Trasferimento" className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-fg">
            <ArrowLeftRight aria-hidden className="size-4" /> {internal ? 'Trasferimento' : 'È un trasferimento tra i tuoi conti?'}
          </h2>
          {t.transferLegs.length > 0 ? (
            <>
              <p className="mb-1 text-sm text-fg-muted">Soldi spostati tra i tuoi conti: non conta né come entrata né come spesa.</p>
              <ul className="divide-y divide-line">
                {t.transferLegs.map((leg) => (
                  <li key={leg.id}>
                    <Link href={`/transactions/${leg.id}`} className="flex items-center justify-between gap-3 py-3 text-[15px] hover:text-fg-muted">
                      <span>
                        {leg.accountName} · {formatIsoDate(leg.bookedOn)}
                      </span>
                      <Money value={leg.amount} currency={t.currency} signDisplay="exceptZero" />
                    </Link>
                  </li>
                ))}
              </ul>
              {t.transferGroupId ? <UnlinkTransferButton id={t.id} groupId={t.transferGroupId} /> : null}
            </>
          ) : candidates.length > 0 ? (
            <>
              <p className="mb-3 text-sm text-fg-muted">
                {internal ? 'Trovato un movimento opposto su un altro conto. È l’altra metà?' : 'C’è un movimento opposto su un altro tuo conto: se sono soldi spostati, collegali.'}
              </p>
              <TransferCandidates id={t.id} currency={t.currency} candidates={candidates} />
            </>
          ) : (
            <p className="text-sm text-fg-muted">
              L’altra metà verrà collegata quando importi l’estratto dell’altro conto. Intanto non conta né come entrata né come spesa.
            </p>
          )}
        </section>
      ) : null}

      <details className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <summary className="cursor-pointer text-[15px] font-semibold text-fg">Modifica descrizione, categoria e note</summary>
        <div className="mt-4">
          <EditDetails
            id={t.id}
            values={{ description: t.description, notes: t.notes, categoryId: t.categoryId, businessId: t.businessId, incomeSourceId: t.incomeSourceId }}
            categories={categories.filter((c) => c.kind === categoryKindFor(t.type))}
            businesses={businesses}
            sources={sources}
            showBusiness={!internal}
            showSource={t.type === 'income'}
          />
        </div>
      </details>

      {t.isCategorized ? (
        <details className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <summary className="cursor-pointer text-[15px] font-semibold text-fg">Cambia classificazione</summary>
          <div className="mt-4">
            <QuickClassify id={t.id} choices={choicesFor(t.amount)} current={null} canConfirmCurrent={false} />
          </div>
        </details>
      ) : null}
    </div>
  )
}
