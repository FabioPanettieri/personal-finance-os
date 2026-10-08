'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { PRIMARY_NAV, activePrimaryHref } from '@/lib/navigation'
import { cn } from '@/lib/utils/cn'

/**
 * Navigazione mobile (< lg): 5 voci, al centro il pulsante "+" per importare
 * un estratto. Target touch ≥ 44 px, safe area iOS.
 */
export function BottomNav() {
  const pathname = usePathname()
  const activeHref = activePrimaryHref(pathname)

  return (
    <nav aria-label="Navigazione principale" className="fixed inset-x-0 bottom-0 z-30 px-3 pb-safe lg:hidden">
      <ul className="mx-auto mb-3 grid max-w-md grid-cols-5 items-center rounded-[24px] border border-line bg-surface-2/95 px-1 py-1.5 shadow-lg backdrop-blur">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon
          const active = activeHref === item.href
          if (item.primary) {
            return (
              <li key={item.href} className="flex justify-center">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  className="grid size-[52px] place-items-center rounded-full text-white shadow-md transition-transform active:scale-95"
                  style={{ background: 'linear-gradient(135deg, var(--bank-revolut), var(--bank-ing) 55%, var(--bank-tr))' }}
                >
                  <Icon aria-hidden className="size-6" strokeWidth={2.5} />
                </Link>
              </li>
            )
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] transition-colors',
                  active ? 'font-semibold text-fg' : 'font-medium text-fg-muted',
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
