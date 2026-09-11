import type { LicenseClass } from './license'
import type { VehicleCategory } from './vehicleListing'

export type VehicleType = 'utilitario' | 'camioneta' | 'camion'

/** Piso del slider de velocidad de crucero — el techo es el `averageSpeedKmh` propio de cada vehículo. */
export const MIN_CRUISE_SPEED_KMH = 40

export interface Vehicle {
  id: string
  type: VehicleType
  averageSpeedKmh: number
  capacityKg: number
  currentCityId: string
  status: 'available' | 'in_transit'
  /** Chofer asignado. Un vehículo sin chofer no puede salir a la ruta. */
  driverId?: string
  // Presentes solo en vehículos comprados en el mercado de flota (ver core/vehicleListing.ts).
  // Los vehículos iniciales del onboarding no los tienen.
  brand?: string
  model?: string
  category?: VehicleCategory
  condition?: 'nuevo' | 'usado'
  mechanicalCondition?: number
  mileageKm?: number
  fuelConsumptionPer100Km?: number
  tankCapacityLiters?: number
  currentFuelLiters?: number
  requiredLicense?: LicenseClass
  hasSleeperCabin?: boolean
  maintenanceCostPerKm?: number
  /** Velocidad a la que el chofer debe circular (km/h) — entre 40 y `averageSpeedKmh` (su tope de fábrica).
   *  Ir más lento consume menos combustible por km (ver core/fuel.ts) a cambio de tardar más. Se aplica
   *  recién en el próximo viaje que acepte, no afecta uno ya en curso. */
  cruiseSpeedKmh?: number
  /** Cuánto debe cargar el chofer cada vez que para a repostar (0 a `tankCapacityLiters`). En 0 nunca
   *  carga nada (riesgo de quedarse sin combustible); por defecto es el tanque lleno. */
  refuelTargetLiters?: number
}

export interface VehicleSpec {
  type: VehicleType
  name: string
  description: string
  purchaseCost: number
  averageSpeedKmh: number
  capacityKg: number
  /** Km de uso antes de necesitar mantenimiento. */
  maintenanceIntervalKm: number
  tankCapacityLiters: number
  fuelConsumptionPer100Km: number
}

// Tres opciones "niveladas": ninguna domina a la otra — la más barata es la más
// rápida pero carga menos, la más cara carga mucho más pero es más lenta y su
// mantenimiento es más espaciado (menos frecuente, pero más caro cuando toca).
export const VEHICLE_CATALOG: VehicleSpec[] = [
  {
    type: 'utilitario',
    name: 'Runner',
    description: 'Ágil y barato. Ideal para arrancar con cargas chicas y viajes cortos.',
    purchaseCost: 10_000_000,
    averageSpeedKmh: 90,
    capacityKg: 800,
    maintenanceIntervalKm: 15_000,
    tankCapacityLiters: 50,
    fuelConsumptionPer100Km: 7,
  },
  {
    type: 'camioneta',
    name: 'Pampera',
    description: 'El equilibrio justo entre capacidad y velocidad para el día a día.',
    purchaseCost: 18_000_000,
    averageSpeedKmh: 85,
    capacityKg: 1_800,
    maintenanceIntervalKm: 20_000,
    tankCapacityLiters: 70,
    fuelConsumptionPer100Km: 10,
  },
  {
    type: 'camion',
    name: 'Titán',
    description: 'Carga mucho más por viaje, pero es más lento y la inversión inicial es alta.',
    purchaseCost: 35_000_000,
    averageSpeedKmh: 75,
    capacityKg: 9_000,
    maintenanceIntervalKm: 30_000,
    tankCapacityLiters: 120,
    fuelConsumptionPer100Km: 22,
  },
]
