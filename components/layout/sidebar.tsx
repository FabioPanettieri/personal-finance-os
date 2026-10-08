'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

import { PRIMARY_NAV, activePrimaryHref } from '@/lib/navigation'
import { cn } from '@/lib/utils/cn'

import { Brand } from './brand'

/** Navigazione desktop (≥ lg): le stesse 5 voci della barra mobile. */
export function Sidebar({ footer }: { footer: ReactNode }) {
  const pathname = usePathname()
  const activeHref = activePrimaryHref(pathname)

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-canvas lg:flex">
      <div className="flex h-20 items-center px-6">
        <Brand />
      </div>
      <nav aria-label="Navigazione principale" className="flex flex-1 flex-col px-4 py-2">
        <ul className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon
            const active = activeHref === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] transition-colors duration-150',
                    active ? 'bg-surface-2 font-semibold text-fg' : 'font-medium text-fg-muted hover:bg-surface hover:text-fg',
                  )}
                >
                  <Icon aria-hidden className="size-[18px]" strokeWidth={active ? 2.25 : 1.75} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="border-t border-line p-4">{footer}</div>
    </aside>
  )
}
