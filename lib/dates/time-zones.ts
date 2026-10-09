/** Fusi orari proposti per primi nel profilo; gli altri restano selezionabili. */
export const COMMON_TIME_ZONES = ['Europe/Rome', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Paris', 'America/New_York', 'UTC']

export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false
  try {
    new Intl.DateTimeFormat('it-IT', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** Tutti i fusi orari IANA noti al runtime, quelli comuni in testa. */
export function timeZoneOptions(): string[] {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return [...COMMON_TIME_ZONES, ...all.filter((z) => !COMMON_TIME_ZONES.includes(z))]
}
