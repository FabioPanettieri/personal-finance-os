import { LogOut } from 'lucide-react'

import { signOut } from '@/features/auth/actions'
import { cn } from '@/lib/utils/cn'

export type UserSummary = {
  displayName: string | null
  email: string | null
}

export function initialsFor(user: UserSummary): string {
  const source = user.displayName?.trim() || user.email?.split('@')[0] || '?'
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : source.slice(0, 2)
  return letters.toUpperCase()
}

export function SignOutButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        aria-label="Esci"
        title="Esci"
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-[var(--radius-control)] px-2.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg',
          className,
        )}
      >
        <LogOut aria-hidden className="size-4" />
        {compact ? null : <span>Esci</span>}
      </button>
    </form>
  )
}

export function UserBadge({ user }: { user: UserSummary }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
      >
        {initialsFor(user)}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-medium text-fg">{user.displayName ?? 'Il mio account'}</p>
        {user.email ? <p className="truncate text-xs text-fg-muted">{user.email}</p> : null}
      </div>
    </div>
  )
}
