import type { Driver } from './driver'
import type { FuelPriceEntry } from './fuelPrice'
import type { Garage } from './garage'
import type { Loan } from './loan'
import { estimateArrivalTimestamp, type Trip } from './trip'
import type { Vehicle } from './vehicle'

export interface Company {
  id: string
  ownerName: string
  companyName: string
  logoId: string
  countryCode: string
  cash: number
  loan: Loan
  garages: Garage[]
  drivers: Driver[]
  vehicles: Vehicle[]
  trips: Trip[]
  fuelPriceHistory: FuelPriceEntry[]
  createdAt: number
}

const COMPANY_KEY = 'porlaruta.company'

// Mientras el juego está en desarrollo activo el esquema de Company todavía
// cambia seguido; esto evita que una empresa guardada con una forma vieja
// rompa el render al faltarle un campo nuevo. No es un SaveSystem versionado
// de verdad (eso es trabajo de más adelante, ver docs/DESIGN.md §17) — solo
// rellena valores por defecto razonables campo por campo.
function normalizeCompany(parsed: Company & { garage?: Garage }): Company {
  if (!Array.isArray(parsed.garages)) {
    parsed.garages = parsed.garage ? [parsed.garage] : []
  }
  // Empresas guardadas antes del selector de país eran todas de Argentina.
  parsed.countryCode = parsed.countryCode ?? 'ar'
  parsed.drivers = (parsed.drivers ?? []).map((driver) => ({
    ...driver,
    licenses: driver.licenses ?? [],
  }))
  parsed.vehicles = (parsed.vehicles ?? []).map((vehicle) => ({
    ...vehicle,
    cruiseSpeedKmh: vehicle.cruiseSpeedKmh ?? vehicle.averageSpeedKmh,
    refuelTargetLiters: vehicle.refuelTargetLiters ?? vehicle.tankCapacityLiters ?? 0,
  }))
  parsed.trips = (parsed.trips ?? []).map((trip) => ({
    ...trip,
    estimatedArrivalTimestamp:
      trip.estimatedArrivalTimestamp ??
      estimateArrivalTimestamp(trip.departureTimestamp, trip.route.distanceTotalKm, trip.averageSpeedKmh),
    // Viajes guardados antes del sistema de combustible: se los trata como si
    // hubieran salido con el tanque lleno y sin paradas agendadas — una
    // aproximación razonable ya que son viajes ya en curso, no nuevos.
    startingFuelLiters: trip.startingFuelLiters ?? 0,
    fuelConsumptionPer100Km: trip.fuelConsumptionPer100Km ?? 0,
    fuelStops: trip.fuelStops ?? [],
  }))
  parsed.fuelPriceHistory = parsed.fuelPriceHistory ?? []
  return parsed
}

export function loadCompany(): Company | null {
  const raw = localStorage.getItem(COMPANY_KEY)
  if (!raw) return null
  try {
    return normalizeCompany(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveCompany(company: Company): void {
  localStorage.setItem(COMPANY_KEY, JSON.stringify(company))
}

export function clearCompany(): void {
  localStorage.removeItem(COMPANY_KEY)
}
