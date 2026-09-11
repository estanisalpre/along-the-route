export const DAY_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
export const NIGHT_STYLE = 'https://tiles.openfreemap.org/styles/dark'

function hourFraction(date: Date): number {
  return date.getHours() + date.getMinutes() / 60
}

/**
 * Elige el estilo base del mapa según la hora local. El cambio ocurre a las
 * 6:00/19:00 — justo los bordes de la ventana de amanecer/atardecer donde el
 * filtro de `getSunTint` ya está transparente, para no mezclar el brillo
 * anaranjado con el estilo del lado equivocado.
 */
export function getMapStyleUrl(date: Date = new Date()): string {
  const hour = hourFraction(date)
  const isNight = hour < 6 || hour >= 19
  return isNight ? NIGHT_STYLE : DAY_STYLE
}

interface TintKeyframe {
  hour: number
  r: number
  g: number
  b: number
  a: number
}

const CLEAR = { r: 0, g: 0, b: 0, a: 0 }
const SUNRISE_GLOW = { r: 255, g: 140, b: 60, a: 0.14 }
const SUNSET_GLOW = { r: 255, g: 100, b: 40, a: 0.14 }

// El naranja SOLO aparece mientras el estilo de día está activo — nunca cruza
// al lado del estilo de noche. Por eso el brillo del amanecer arranca recién
// a las 6:00 (justo cuando el mapa ya cambió a día) y el del atardecer ya
// terminó de apagarse a las 19:00 (justo antes de que cambie a noche). Si el
// naranja llegara a superponerse con el estilo oscuro se ve como un manchón
// sucio en vez de un brillo — por eso el filtro siempre "ya está resuelto"
// (transparente) exactamente en el momento del cambio de estilo.
const KEYFRAMES: TintKeyframe[] = [
  { hour: 0, ...CLEAR },
  { hour: 6, ...CLEAR }, // acá cambia el estilo a día — el filtro ya está neutro
  { hour: 6.5, ...SUNRISE_GLOW },
  { hour: 7, ...CLEAR },
  { hour: 18, ...CLEAR },
  { hour: 18.5, ...SUNSET_GLOW },
  { hour: 19, ...CLEAR }, // acá cambia el estilo a noche — el filtro ya está neutro
  { hour: 24, ...CLEAR },
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Color del filtro para la hora dada: interpola entre los keyframes de arriba.
 * Transparente casi siempre; sube y baja suave (un brillo sutil, no un tinte
 * fuerte) solo dentro de la ventana de amanecer/atardecer, siempre con el
 * estilo de día ya activo.
 */
export function getSunTint(date: Date = new Date()): string {
  const hour = hourFraction(date)

  let k1 = KEYFRAMES[0]
  let k2 = KEYFRAMES[KEYFRAMES.length - 1]
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (hour >= KEYFRAMES[i].hour && hour <= KEYFRAMES[i + 1].hour) {
      k1 = KEYFRAMES[i]
      k2 = KEYFRAMES[i + 1]
      break
    }
  }

  const span = k2.hour - k1.hour
  const t = span === 0 ? 0 : (hour - k1.hour) / span
  const r = lerp(k1.r, k2.r, t)
  const g = lerp(k1.g, k2.g, t)
  const b = lerp(k1.b, k2.b, t)
  const a = lerp(k1.a, k2.a, t)

  return `rgba(${r.toFixed(0)}, ${g.toFixed(0)}, ${b.toFixed(0)}, ${a.toFixed(3)})`
}
