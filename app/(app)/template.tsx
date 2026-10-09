import type { ReactNode } from 'react'

/** Si rimonta a ogni cambio pagina: ingresso morbido del contenuto (animate-enter, rispetta "riduci movimento"). */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-enter">{children}</div>
}
