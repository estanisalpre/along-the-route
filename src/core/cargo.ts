import type { City } from './cities'
import { seededRandom } from './seededRandom'

export interface Cargo {
  id: string
  category: string
  originCityId: string
  destinationCityId: string
  weightKg: number
  distanceKm: number
  payout: number
  /** Cuándo vence — junto con todo el lote del que forma parte (ver core/cargoMarket.ts). */
  expiresAt: number
}

const CATEGORIES = ['Paquetería', 'Repuestos', 'Alimentos', 'Bebidas', 'Materiales de construcción']

const PAYOUT_PER_KM_MIN = 2400
const PAYOUT_PER_KM_MAX = 3200

/**
 * Genera una oferta de carga entre dos ciudades a partir de la distancia real
 * ya calculada. Determinista en `seed` (no usa `Math.random()`): el mismo
 * seed siempre da la misma categoría/peso/pago — así todo el lote de un ciclo
 * del mercado (ver cargoMarket.ts) sale igual para cualquiera que lo genere
 * en el mismo momento, no solo el par de ciudades.
 */
export function buildCargoOffer(origin: City, destination: City, distanceKm: number, seed: number, expiresAt: number): Cargo {
  const payoutPerKm = PAYOUT_PER_KM_MIN + seededRandom(seed) * (PAYOUT_PER_KM_MAX - PAYOUT_PER_KM_MIN)
  const category = CATEGORIES[Math.floor(seededRandom(seed + 1) * CATEGORIES.length)]
  const weightKg = Math.round((300 + seededRandom(seed + 2) * 2700) / 50) * 50
  return {
    id: `${origin.id}__${destination.id}__${seed}`,
    category,
    originCityId: origin.id,
    destinationCityId: destination.id,
    weightKg,
    distanceKm,
    payout: Math.round(distanceKm * payoutPerKm),
    expiresAt,
  }
}
