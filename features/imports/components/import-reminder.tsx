import { CalendarClock, ChevronRight } from "lucide-react";
import Link from "next/link";

import { BankMark } from "@/components/finance/bank-mark";
import { formatIsoDate } from "@/lib/dates";
import type { ImportReminder } from "@/lib/imports/reminder";

/**
 * Promemoria settimanale (Home e Importa, su telefono e PC): quali estratti
 * caricare e da che giorno, in base agli ultimi già importati.
 */
export function ImportReminderBanner({
  reminders,
  showAction = true,
}: {
  reminders: ImportReminder[];
  showAction?: boolean;
}) {
  if (reminders.length === 0) return null;
  return (
    <section
      aria-labelledby="import-reminder-title"
      data-testid="import-reminder"
      className="mb-6 rounded-[var(--radius-card)] border border-accent/30 bg-surface p-4 lg:mb-8 lg:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <CalendarClock aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="import-reminder-title"
            className="text-[15px] font-semibold text-fg"
          >
            È ora di caricare gli estratti della settimana
          </h2>
          <p className="text-[13px] text-fg-muted">
            Scaricali dall’app della banca e importali: così i numeri restano al
            passo.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center gap-3 text-[14px]">
                <BankMark account={r} className="size-7 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-fg">{r.name}</span>{" "}
                  <span className="text-fg-muted">
                    {r.suggestedFrom
                      ? `· dal ${formatIsoDate(r.suggestedFrom)} al ${formatIsoDate(r.suggestedTo)}`
                      : "· nessun movimento ancora: scarica gli ultimi mesi"}
                    {r.lastImportOn
                      ? ` (ultimo caricamento ${formatIsoDate(r.lastImportOn)})`
                      : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        {showAction ? (
          <Link
            href="/imports/new"
            className="hidden min-h-11 shrink-0 items-center gap-1 rounded-full bg-fg px-4 text-sm font-semibold text-canvas sm:inline-flex"
          >
            Importa <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : null}
      </div>
      {showAction ? (
        <Link
          href="/imports/new"
          className="mt-3 flex min-h-11 items-center justify-center rounded-full bg-fg text-sm font-semibold text-canvas sm:hidden"
        >
          Importa ora
        </Link>
      ) : null}
    </section>
  );
}
