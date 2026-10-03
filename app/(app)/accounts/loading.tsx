import { Skeleton } from '@/components/ui/skeleton'

export default function AccountsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Caricamento conti…</span>
      <Skeleton className="mb-2 h-8 w-32" />
      <Skeleton className="mb-8 h-4 w-72" />
      <Skeleton className="mb-6 h-40 rounded-[var(--radius-card)]" />
      <div className="flex flex-col gap-px overflow-hidden rounded-[var(--radius-card)]">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-none" />
        ))}
      </div>
    </div>
  )
}
