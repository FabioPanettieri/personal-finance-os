'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { PRIMARY_NAV, activePrimaryHref } from '@/lib/navigation'
import { cn } from '@/lib/utils/cn'

/** Navigazione mobile (< lg): 5 voci, target touch ≥ 44 px, safe area iOS. */
export function BottomNav() {
  const pathname = usePathname()
  const activeHref = activePrimaryHref(pathname)

  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-safe backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon
          const active = activeHref === item.href
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] transition-colors',
                  active ? 'font-medium text-accent' : 'text-fg-muted',
                )}
              >
                <Icon aria-hidden className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
