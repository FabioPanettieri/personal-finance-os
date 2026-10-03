import type { ReactNode } from 'react'

import { Brand } from '@/components/layout/brand'
import { ThemeToggle } from '@/components/layout/theme-toggle'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-5 pt-safe sm:px-8">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  )
}
