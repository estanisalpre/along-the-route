import type { City } from './cities'
import { seededRandom } from './seededRandom'

/**
 * El mercado de cargas ya no depende de la flota del jugador (antes solo se
 * generaban ofertas en las ciudades donde había un vehículo libre con chofer
 * — apenas ese vehículo salía de viaje, la lista quedaba vacía). Ahora es un
 * lote fijo de ofertas que se renueva completo cada `CARGO_MARKET_CYCLE_MS`
 * (6 horas reales), calculado a partir del reloj — no del estado de nadie.
 *
 * Esto es a propósito el mismo cálculo que haría un backend real más
 * adelante: `cargoMarketCycleIndex(now)` da el mismo número para cualquiera
 * que juegue en simultáneo, en cualquier lado, sin necesitar coordinarse —
 * es una cuenta directa desde el epoch, no depende de cuándo arrancó cada
 * empresa (a diferencia del precio del combustible, que si ancla a
 * `company.createdAt`). El día que esto se sirva desde una base de datos, el
 * server puede usar exactamente esta misma cuenta para saber qué lote le
 * toca sin duplicar lógica — y las funciones de acá (`pickCargoMarketPairs`,
 * `cargoMarketExpiresAt`) se pueden mover tal cual a ese backend.
 */
export const CARGO_MARKET_CYCLE_MS = 6 * 60 * 60 * 1000

/** Cuántas ofertas trae cada lote — "mucha capacidad", para que nadie se quede sin nada
 *  para elegir. Con un backend real esto podría ser mucho más grande sin costo extra para
 *  el cliente (el cálculo pesado ya estaría hecho); acá cada una implica pedir una ruta
 *  real, así que se mantiene en un número razonable para no saturar el servidor de ruteo. */
export const CARGO_OFFERS_PER_CYCLE = 24

export function cargoMarketCycleIndex(now: number): number {
  return Math.floor(now / CARGO_MARKET_CYCLE_MS)
}

export function cargoMarketExpiresAt(cycleIndex: number): number {
  return (cycleIndex + 1) * CARGO_MARKET_CYCLE_MS
}

/**
 * Elige qué pares origen-destino le tocan a este ciclo. Determinista: el
 * mismo `cycleIndex` siempre elige los mismos pares (para la misma lista de
 * ciudades) — no usa `Math.random()`. Evita repetir el mismo par dos veces
 * dentro del mismo lote.
 */
export function pickCargoMarketPairs(cycleIndex: number, cities: City[]): [City, City][] {
  if (cities.length < 2) return []

  const pairs: [City, City][] = []
  const seen = new Set<string>()
  let attempt = 0
  const maxAttempts = CARGO_OFFERS_PER_CYCLE * 5

  while (pairs.length < CARGO_OFFERS_PER_CYCLE && attempt < maxAttempts) {
    const seed = cycleIndex * 977 + attempt * 2
    const originIdx = Math.floor(seededRandom(seed) * cities.length)
    const destIdx = Math.floor(seededRandom(seed + 1) * cities.length)
    attempt++
    if (originIdx === destIdx) continue

    const key = `${originIdx}-${destIdx}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push([cities[originIdx], cities[destIdx]])
  }

  return pairs
}
