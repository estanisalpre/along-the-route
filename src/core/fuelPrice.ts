import { seededRandom } from './seededRandom'

export interface FuelPriceEntry {
  /** Timestamp del inicio de esa hora (ms, UTC). */
  hourTimestamp: number
  price: number
}

const HOUR_MS = 3_600_000
const BASE_PRICE = 5_000
const MIN_PRICE = 1_500
const MAX_PRICE = 15_000
const MAX_CHANGE_PERCENT = 75
const HISTORY_HOURS = 24

function hourIndex(timestamp: number): number {
  return Math.floor(timestamp / HOUR_MS)
}

function priceChangeForHour(hour: number): { percent: number; direction: 1 | -1 } {
  const percent = seededRandom(hour * 12.9898) * MAX_CHANGE_PERCENT
  const direction = seededRandom(hour * 78.233 + 1) < 0.5 ? -1 : 1
  return { percent, direction }
}

function clampPrice(price: number): number {
  return Math.min(MAX_PRICE, Math.max(MIN_PRICE, Math.round(price)))
}

/**
 * Extiende (si hace falta) el historial de precios hasta la hora actual y lo
 * recorta a las últimas `HISTORY_HOURS`. Es una caminata aleatoria pero
 * determinista: la variación de cada hora sale de un hash de esa hora, no de
 * `Math.random()`, así que no importa si el juego estuvo cerrado — al volver
 * a abrir se reconstruye exactamente la misma secuencia de precios que si
 * hubiera estado abierto todo el tiempo.
 *
 * `genesisTimestamp` fija el punto de partida de la caminata (usar
 * `company.createdAt`) — si no se ancla a un timestamp fijo, "arrancar desde
 * vacío" daría un resultado distinto según en qué momento se llame por
 * primera vez a la función, rompiendo el determinismo.
 */
export function ensureFuelPriceHistory(history: FuelPriceEntry[], now: number, genesisTimestamp: number): FuelPriceEntry[] {
  const currentHour = hourIndex(now)
  const next = [...history]

  if (next.length === 0) {
    next.push({ hourTimestamp: hourIndex(genesisTimestamp) * HOUR_MS, price: BASE_PRICE })
  }

  let lastHour = hourIndex(next[next.length - 1].hourTimestamp)
  let lastPrice = next[next.length - 1].price

  while (lastHour < currentHour) {
    lastHour += 1
    const { percent, direction } = priceChangeForHour(lastHour)
    lastPrice = clampPrice(lastPrice * (1 + (direction * percent) / 100))
    next.push({ hourTimestamp: lastHour * HOUR_MS, price: lastPrice })
  }

  return next.slice(-HISTORY_HOURS)
}

export function getCurrentFuelPrice(history: FuelPriceEntry[]): number {
  return history.length > 0 ? history[history.length - 1].price : BASE_PRICE
}
