import type { ReactNode } from 'react'

import { BottomNav } from './bottom-nav'
import { Brand } from './brand'
import { Sidebar } from './sidebar'
import { ThemeToggle } from './theme-toggle'
import { SignOutButton, UserBadge, type UserSummary } from './user-menu'

/**
 * Struttura dell'area autenticata: sidebar fissa su desktop, top bar +
 * bottom navigation su mobile. Il contenuto lascia spazio alla bottom nav.
 */
export function AppShell({ user, children }: { user: UserSummary; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Vai al contenuto
      </a>

      <Sidebar
        footer={
          <div className="flex flex-col gap-2">
            <UserBadge user={user} />
            <div className="flex items-center justify-between">
              <ThemeToggle />
              <SignOutButton />
            </div>
          </div>
        }
      />

      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 pt-safe backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Brand />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SignOutButton compact />
          </div>
        </div>
      </header>

      <main id="main" className="pb-24 lg:pb-12 lg:pl-[248px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10">{children}</div>
      </main>

      <BottomNav />
    </div>
  )
}
