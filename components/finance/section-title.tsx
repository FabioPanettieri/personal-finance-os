import Link from 'next/link'
import type { ReactNode } from 'react'

export function SectionTitle({ children, href, linkLabel, id }: { children: ReactNode; href?: string; linkLabel?: string; id?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-lg font-semibold tracking-[-0.01em] text-fg">
        {children}
      </h2>
      {href ? (
        <Link href={href} className="text-sm font-medium text-fg-muted hover:text-fg">
          {linkLabel ?? 'Vedi tutti'}
        </Link>
      ) : null}
    </div>
  )
}
