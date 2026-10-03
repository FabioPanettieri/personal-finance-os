/** Importo in centesimi come testo italiano ("-1.565,00"), senza aritmetica in virgola mobile. */
export function formatCentsPlain(value: number): string {
  const negative = value < 0
  const digits = String(Math.abs(value)).padStart(3, '0')
  const integer = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}${integer},${digits.slice(-2)}`
}
