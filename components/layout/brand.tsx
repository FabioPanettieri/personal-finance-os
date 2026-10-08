import Link from 'next/link'

/** Logo: i tre colori delle banche in un unico segno. */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`${className} shrink-0 rounded-[10px]`}
      style={{ background: 'linear-gradient(135deg, var(--bank-revolut), var(--bank-ing) 55%, var(--bank-tr))' }}
    />
  )
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md text-fg" aria-label="Finanze — Home">
      <BrandMark />
      <span className="text-[17px] font-semibold tracking-[-0.01em]">Finanze</span>
    </Link>
  )
}
