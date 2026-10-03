import Link from 'next/link'

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md text-fg" aria-label="Personal Finance OS — Home">
      <span aria-hidden className="grid size-8 place-items-center rounded-[9px] bg-fg text-[13px] font-bold text-canvas">
        PF
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em]">Finance OS</span>
    </Link>
  )
}
