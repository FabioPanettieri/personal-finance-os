import { Skeleton } from '@/components/ui/skeleton'

export default function AccountDetailLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Caricamento conto…</span>
      <Skeleton className="mb-6 h-4 w-24" />
      <div className="mb-8 flex items-center gap-4">
        <Skeleton className="size-12 rounded-[12px]" />
        <div className="flex-1">
          <Skeleton className="mb-2 h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Skeleton className="mt-4 h-72 rounded-[var(--radius-card)]" />
    </div>
  )
}
