'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  isThemePreference,
  nextThemePreference,
  resolveTheme,
  type ThemePreference,
} from '@/lib/theme'
import { cn } from '@/lib/utils/cn'

const LABELS: Record<ThemePreference, string> = {
  system: 'Tema: automatico',
  light: 'Tema: chiaro',
  dark: 'Tema: scuro',
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE
  } catch {
    return DEFAULT_THEME_PREFERENCE
  }
}

function applyTheme(preference: ThemePreference) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.theme = resolveTheme(preference, prefersDark)
}

export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  // null finché non si legge localStorage: evita mismatch di idratazione.
  const [preference, setPreference] = useState<ThemePreference | null>(null)

  useEffect(() => {
    const initial = readPreference()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizzazione con localStorage, disponibile solo nel browser
    setPreference(initial)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (readPreference() === 'system') applyTheme('system')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const current = preference ?? DEFAULT_THEME_PREFERENCE
  const Icon = current === 'dark' ? Moon : current === 'light' ? Sun : Monitor

  return (
    <button
      type="button"
      onClick={() => {
        const next = nextThemePreference(current)
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next)
        } catch {
          // Storage non disponibile (navigazione privata): il tema vale solo per questa pagina.
        }
        setPreference(next)
        applyTheme(next)
      }}
      aria-label={LABELS[current]}
      title={LABELS[current]}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-[var(--radius-control)] px-2.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {showLabel ? <span>{LABELS[current].replace('Tema: ', 'Tema ')}</span> : null}
    </button>
  )
}
