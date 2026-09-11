import { regenerateGasStations } from './gasStation'

export interface City {
  id: string
  name: string
  province: string
  lat: number
  lon: number
  population: number
}

interface RawCityRow {
  city: string
  lat: string
  lng: string
  country: string
  iso2: string
  admin_name: string
  capital: string
  population: string
  population_proper?: string
}

// Un archivo por país en src/map/by_country/<code>.json (mismo formato que el
// que ya cargamos para Argentina). `import.meta.glob` los deja como imports
// diferidos: el JSON de un país no se descarga/empaqueta hasta que alguien
// realmente elige ese país — así el bundle no carga los ~9 países de memoria.
const countryFileModules = import.meta.glob<RawCityRow[]>('/src/map/by_country/*.json', { import: 'default' })

function countryFileKey(countryCode: string): string | undefined {
  const suffix = `/${countryCode.toLowerCase()}.json`
  return Object.keys(countryFileModules).find((path) => path.toLowerCase().endsWith(suffix))
}

/** Qué países tienen realmente datos cargados (el resto se muestra "próximamente" en el onboarding). */
export function getAvailableCountryCodes(): string[] {
  return Object.keys(countryFileModules).map((path) => {
    const match = /([a-z]{2})\.json$/i.exec(path)
    return match![1].toLowerCase()
  })
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildCities(rows: RawCityRow[]): City[] {
  // Ordenar por población antes de asignar ids: si dos ciudades del mismo país
  // se llaman igual, la más grande se queda con el slug "limpio".
  const sorted = [...rows].sort((a, b) => Number(b.population || 0) - Number(a.population || 0))
  const usedIds = new Set<string>()

  const cities = sorted.map((row) => {
    let id = slugify(row.city)
    if (usedIds.has(id)) id = `${slugify(row.city)}-${slugify(row.admin_name)}`
    let suffix = 2
    while (usedIds.has(id)) {
      id = `${slugify(row.city)}-${suffix}`
      suffix += 1
    }
    usedIds.add(id)

    return {
      id,
      name: row.city,
      province: row.admin_name,
      lat: Number(row.lat),
      lon: Number(row.lng),
      population: Number(row.population) || 0,
    }
  })

  cities.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return cities
}

/**
 * Lista "viva" de las ciudades del país actualmente elegido. Es un array
 * mutado in-place (no reasignado) para que los módulos que hicieron
 * `import { CITIES } ...` sigan viendo los datos nuevos después de
 * `loadCountryCities` — los bindings de ES modules son referencias vivas.
 */
export const CITIES: City[] = []

/** Carga las ciudades del país elegido y las deja disponibles en `CITIES`. */
export async function loadCountryCities(countryCode: string): Promise<City[]> {
  const key = countryFileKey(countryCode)
  if (!key) {
    throw new Error(`No hay datos de ciudades cargados para "${countryCode}" todavía`)
  }
  const rows = await countryFileModules[key]()
  const cities = buildCities(rows)
  CITIES.length = 0
  CITIES.push(...cities)
  regenerateGasStations(CITIES)
  return CITIES
}
