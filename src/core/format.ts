const formatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

export function formatArs(amount: number): string {
  return `AR$ ${formatter.format(Math.round(amount))}`
}

export function formatClockTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

/** Formatea una duración en ms como "Xh Ym" (o "Ym" si es menos de una hora). */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}
