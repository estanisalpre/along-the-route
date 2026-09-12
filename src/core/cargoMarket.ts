import type { City } from './cities'
import { haversineDistanceKm } from './geo'
import { seededRandom } from './seededRandom'

/**
 * El mercado de cargas ya no depende de la flota del jugador (antes solo se
 * generaban ofertas en las ciudades donde había un vehículo libre con chofer
 * — apenas ese vehículo salía de viaje, la lista quedaba vacía). Ahora es un
 * lote fijo que se renueva completo cada `CARGO_MARKET_CYCLE_MS` (6 horas
 * reales), calculado a partir del reloj — no del estado de nadie — y con
 * **una oferta por cada ciudad del país** como origen: ninguna ciudad se
 * queda sin nada para ofrecer, aunque le toque una carga mala.
 *
 * Esto es a propósito el mismo cálculo que haría un backend real más
 * adelante: `cargoMarketCycleIndex(now)` da el mismo número para cualquiera
 * que juegue en simultáneo, en cualquier lado, sin necesitar coordinarse —
 * es una cuenta directa desde el epoch, no depende de cuándo arrancó cada
 * empresa (a diferencia del precio del combustible, que si ancla a
 * `company.createdAt`). El día que esto se sirva desde una base de datos, el
 * server puede usar exactamente esta misma cuenta para saber qué lote le
 * toca sin duplicar lógica.
 */
export const CARGO_MARKET_CYCLE_MS = 6 * 60 * 60 * 1000

/**
 * La distancia de la oferta (para fijar el pago al generarla) se estima en
 * línea recta, no con una ruta real — pedirle a OSRM una ruta por cada una
 * de las ~500 ciudades de un país sería carísimo solo para armar el lote. La
 * ruta real (más larga, sigue caminos) se pide recién al aceptar (ver
 * `acceptCargo` en Dashboard.tsx) — este factor achica la diferencia entre
 * la distancia estimada y la real, que en caminos reales casi siempre es
 * mayor a la línea recta.
 */
const ROAD_DISTANCE_FACTOR = 1.3

export function cargoMarketCycleIndex(now: number): number {
  return Math.floor(now / CARGO_MARKET_CYCLE_MS)
}

export function cargoMarketExpiresAt(cycleIndex: number): number {
  return (cycleIndex + 1) * CARGO_MARKET_CYCLE_MS
}

export interface CargoMarketPair {
  origin: City
  destination: City
  /** Estimada en línea recta × un factor de camino — ver ROAD_DISTANCE_FACTOR. */
  estimatedDistanceKm: number
  /** Seed para pasarle a `buildCargoOffer` — determinista, único por par dentro del ciclo. */
  seed: number
}

/**
 * Un par origen-destino por cada ciudad del país (la ciudad es siempre el
 * origen) — determinista: el mismo `cycleIndex` siempre elige los mismos
 * destinos, para cualquiera. No usa `Math.random()` ni pide rutas reales,
 * así que cubre TODAS las ciudades sin llamar a la red ni una vez.
 */
export function pickCargoMarketPairs(cycleIndex: number, cities: City[]): CargoMarketPair[] {
  if (cities.length < 2) return []

  return cities.map((origin, i) => {
    const seed = cycleIndex * 977 + i * 2
    let destIdx = Math.floor(seededRandom(seed) * cities.length)
    if (destIdx === i) destIdx = (destIdx + 1) % cities.length
    const destination = cities[destIdx]
    const estimatedDistanceKm =
      haversineDistanceKm([origin.lon, origin.lat], [destination.lon, destination.lat]) * ROAD_DISTANCE_FACTOR
    return { origin, destination, estimatedDistanceKm, seed }
  })
}
