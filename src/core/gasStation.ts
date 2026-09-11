import type { City } from './cities'
import { destinationPoint } from './geo'
import { getCurrentFuelPrice, type FuelPriceEntry } from './fuelPrice'
import { hashString, seededRandom } from './seededRandom'

export type GasStationBrand = 'Jhell' | 'PFY' | 'Carbon Gas'

export const GAS_STATION_BRANDS: { id: GasStationBrand; color: string }[] = [
  { id: 'Jhell', color: '#22c55e' },
  { id: 'PFY', color: '#3b82f6' },
  { id: 'Carbon Gas', color: '#f97316' },
]

export interface GasStation {
  id: string
  brand: GasStationBrand
  lat: number
  lon: number
  /** Ciudad de referencia — para mostrar "cerca de X" y para la generación. */
  nearCityId: string
}

function brandFor(seed: number): GasStationBrand {
  return GAS_STATION_BRANDS[Math.abs(seed) % GAS_STATION_BRANDS.length].id
}

const CITY_OFFSET_MIN_KM = 0.4
const CITY_OFFSET_MAX_KM = 2

/**
 * Genera las gasolineras del país cargado en `CITIES`: una cerca de cada
 * ciudad (con un corrimiento aleatorio pero determinista, para que no quede
 * pegada al punto de la ciudad y se puedan distinguir una de otra) y, para
 * una de cada 6 ciudades, una extra "de ruta" a mitad de camino hacia la
 * siguiente ciudad de la lista. No es literalmente "la ciudad más cercana"
 * (eso pediría comparar todas las ciudades entre sí, caro con miles de
 * filas) — alcanza para dar la sensación de estaciones también sobre
 * carreteras típicas, no solo pegadas a las ciudades.
 */
export function generateGasStations(cities: City[]): GasStation[] {
  const stations: GasStation[] = []

  cities.forEach((city, index) => {
    const seed = hashString(city.id)
    const bearing = seededRandom(seed) * 360
    const distanceKm = CITY_OFFSET_MIN_KM + seededRandom(seed + 1) * (CITY_OFFSET_MAX_KM - CITY_OFFSET_MIN_KM)
    const [lon, lat] = destinationPoint([city.lon, city.lat], bearing, distanceKm)
    stations.push({ id: `gs-${city.id}`, brand: brandFor(hashString(`${city.id}-brand`)), lat, lon, nearCityId: city.id })

    if (index % 6 === 0 && index + 1 < cities.length) {
      const next = cities[index + 1]
      stations.push({
        id: `gs-route-${city.id}`,
        brand: brandFor(hashString(`${city.id}-route`)),
        lat: (city.lat + next.lat) / 2,
        lon: (city.lon + next.lon) / 2,
        nearCityId: city.id,
      })
    }
  })

  return stations
}

/** Lista "viva" — mismo patrón que `CITIES` en cities.ts. */
export const GAS_STATIONS: GasStation[] = []

export function regenerateGasStations(cities: City[]): void {
  GAS_STATIONS.length = 0
  GAS_STATIONS.push(...generateGasStations(cities))
}

/**
 * Precio actual de la gasolinera: siempre 10% más caro que el precio de
 * mercado (el mismo que se paga al cargar combustible del garage) — así
 * nunca conviene cargar en una estación pudiendo evitarlo. Se recalcula solo
 * cada hora, porque `getCurrentFuelPrice` ya cambia por hora.
 */
export function getGasStationPrice(fuelPriceHistory: FuelPriceEntry[]): number {
  return Math.round(getCurrentFuelPrice(fuelPriceHistory) * 1.1)
}
