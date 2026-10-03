'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

import { PRIMARY_NAV, SECONDARY_NAV, isNavItemActive, type NavItem } from '@/lib/navigation'
import { cn } from '@/lib/utils/cn'

import { Brand } from './brand'

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm transition-colors duration-150',
        active ? 'bg-surface-2 font-medium text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <Icon aria-hidden className={cn('size-4', active ? 'text-accent' : undefined)} />
      {item.label}
    </Link>
  )
}

/** Navigazione desktop (≥ lg). Su mobile la sostituisce BottomNav. */
export function Sidebar({ footer }: { footer: ReactNode }) {
  const pathname = usePathname()
  const settings = PRIMARY_NAV.find((item) => item.href === '/settings')
  const main = PRIMARY_NAV.filter((item) => item.href !== '/settings')

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>
      <nav aria-label="Navigazione principale" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-0.5">
          {main.map((item) => (
            <li key={item.href}>
              <SidebarLink item={item} active={isNavItemActive(pathname, item.href)} />
            </li>
          ))}
        </ul>
        <div>
          <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wider text-fg-subtle uppercase">Sezioni</p>
          <ul className="flex flex-col gap-0.5">
            {SECONDARY_NAV.map((item) => (
              <li key={item.href}>
                <SidebarLink item={item} active={isNavItemActive(pathname, item.href)} />
              </li>
            ))}
          </ul>
        </div>
        {settings ? (
          <ul className="mt-auto flex flex-col gap-0.5">
            <li>
              <SidebarLink item={settings} active={isNavItemActive(pathname, settings.href)} />
            </li>
          </ul>
        ) : null}
      </nav>
      <div className="border-t border-line p-3">{footer}</div>
    </aside>
  )
}
