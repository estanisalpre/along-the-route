import type { LicenseClass } from './license'

export type VehicleCategory =
  | 'mini_furgon'
  | 'furgon'
  | 'furgon_grande'
  | 'camion_mediano'
  | 'camion_grande'
  | 'camion_articulado'

export type AxleConfig = 'simple' | 'tandem' | 'articulado'

export interface CategoryInfo {
  id: VehicleCategory
  name: string
  description: string
  icon: string
  requiredLicense: LicenseClass
  axleConfig: AxleConfig
  wheelCount: number
  canHaveSleeperCabin: boolean
  averageSpeedKmh: number
  maintenanceCostPerKm: number
}

export const VEHICLE_CATEGORIES: Record<VehicleCategory, CategoryInfo> = {
  mini_furgon: {
    id: 'mini_furgon',
    name: 'Mini furgón',
    description: 'Utilitarios chicos para paquetería y cargas livianas urbanas',
    icon: '🚐',
    requiredLicense: 'B1',
    axleConfig: 'simple',
    wheelCount: 4,
    canHaveSleeperCabin: false,
    averageSpeedKmh: 95,
    maintenanceCostPerKm: 80,
  },
  furgon: {
    id: 'furgon',
    name: 'Furgón',
    description: 'Furgones medianos tipo Sprinter/Master, buen equilibrio carga/velocidad',
    icon: '🚚',
    requiredLicense: 'B1',
    axleConfig: 'simple',
    wheelCount: 4,
    canHaveSleeperCabin: false,
    averageSpeedKmh: 90,
    maintenanceCostPerKm: 120,
  },
  furgon_grande: {
    id: 'furgon_grande',
    name: 'Furgón grande',
    description: 'Camiones livianos tipo NHR/NKR, ya requieren licencia profesional',
    icon: '🚛',
    requiredLicense: 'C1',
    axleConfig: 'simple',
    wheelCount: 6,
    canHaveSleeperCabin: false,
    averageSpeedKmh: 85,
    maintenanceCostPerKm: 180,
  },
  camion_mediano: {
    id: 'camion_mediano',
    name: 'Camión mediano',
    description: 'Rígidos tipo NPR/NQR para cargas medianas de larga distancia',
    icon: '🚛',
    requiredLicense: 'C1',
    axleConfig: 'simple',
    wheelCount: 6,
    canHaveSleeperCabin: false,
    averageSpeedKmh: 80,
    maintenanceCostPerKm: 250,
  },
  camion_grande: {
    id: 'camion_grande',
    name: 'Camión grande',
    description: 'Rígidos de doble eje (10 ruedas), algunos con cucheta para descansar en ruta',
    icon: '🚛',
    requiredLicense: 'C2',
    axleConfig: 'tandem',
    wheelCount: 10,
    canHaveSleeperCabin: true,
    averageSpeedKmh: 75,
    maintenanceCostPerKm: 350,
  },
  camion_articulado: {
    id: 'camion_articulado',
    name: 'Camión articulado',
    description: 'Tractor + semirremolque para las cargas más grandes y los viajes más largos',
    icon: '🚛',
    requiredLicense: 'E',
    axleConfig: 'articulado',
    wheelCount: 12,
    canHaveSleeperCabin: true,
    averageSpeedKmh: 70,
    maintenanceCostPerKm: 500,
  },
}

interface BaseModel {
  brand: string
  model: string
  category: VehicleCategory
  basePrice: number
  cargoCapacityKg: number
  fuelConsumptionPer100Km: number
  tankCapacityLiters: number
  /** Solo tiene sentido si la categoría admite cucheta (camion_grande/articulado). */
  sleeperCabinAvailable: boolean
}

// Precios y specs de referencia (AR$ estilizados para el juego, no precios de mercado real).
// Consumos y capacidades de carga basados en fichas técnicas reales de cada modelo.
const BASE_MODELS: BaseModel[] = [
  // Mini furgones
  { brand: 'Renault', model: 'Kangoo', category: 'mini_furgon', basePrice: 14_000_000, cargoCapacityKg: 800, fuelConsumptionPer100Km: 6.5, tankCapacityLiters: 50, sleeperCabinAvailable: false },
  { brand: 'Citroën', model: 'Berlingo', category: 'mini_furgon', basePrice: 15_000_000, cargoCapacityKg: 850, fuelConsumptionPer100Km: 6.8, tankCapacityLiters: 60, sleeperCabinAvailable: false },
  { brand: 'Fiat', model: 'Fiorino', category: 'mini_furgon', basePrice: 12_500_000, cargoCapacityKg: 650, fuelConsumptionPer100Km: 6.0, tankCapacityLiters: 45, sleeperCabinAvailable: false },

  // Furgones
  { brand: 'Mercedes-Benz', model: 'Sprinter', category: 'furgon', basePrice: 32_000_000, cargoCapacityKg: 2_593, fuelConsumptionPer100Km: 9.5, tankCapacityLiters: 75, sleeperCabinAvailable: false },
  { brand: 'Renault', model: 'Master', category: 'furgon', basePrice: 29_000_000, cargoCapacityKg: 2_500, fuelConsumptionPer100Km: 8.5, tankCapacityLiters: 80, sleeperCabinAvailable: false },
  { brand: 'Iveco', model: 'Daily', category: 'furgon', basePrice: 31_000_000, cargoCapacityKg: 2_800, fuelConsumptionPer100Km: 10.0, tankCapacityLiters: 90, sleeperCabinAvailable: false },

  // Furgones grandes
  { brand: 'Chevrolet', model: 'NHR', category: 'furgon_grande', basePrice: 38_000_000, cargoCapacityKg: 2_065, fuelConsumptionPer100Km: 13.0, tankCapacityLiters: 65, sleeperCabinAvailable: false },
  { brand: 'Chevrolet', model: 'NKR', category: 'furgon_grande', basePrice: 45_000_000, cargoCapacityKg: 3_530, fuelConsumptionPer100Km: 15.0, tankCapacityLiters: 70, sleeperCabinAvailable: false },
  { brand: 'Hyundai', model: 'HD35', category: 'furgon_grande', basePrice: 43_000_000, cargoCapacityKg: 3_200, fuelConsumptionPer100Km: 14.0, tankCapacityLiters: 70, sleeperCabinAvailable: false },

  // Camiones medianos
  { brand: 'Chevrolet', model: 'NPR', category: 'camion_mediano', basePrice: 58_000_000, cargoCapacityKg: 5_115, fuelConsumptionPer100Km: 20.0, tankCapacityLiters: 100, sleeperCabinAvailable: false },
  { brand: 'Chevrolet', model: 'NQR', category: 'camion_mediano', basePrice: 64_000_000, cargoCapacityKg: 5_875, fuelConsumptionPer100Km: 22.0, tankCapacityLiters: 100, sleeperCabinAvailable: false },
  { brand: 'Ford', model: 'Cargo 816', category: 'camion_mediano', basePrice: 68_000_000, cargoCapacityKg: 6_500, fuelConsumptionPer100Km: 24.0, tankCapacityLiters: 120, sleeperCabinAvailable: false },

  // Camiones grandes (doble eje)
  { brand: 'Mercedes-Benz', model: 'Atego', category: 'camion_grande', basePrice: 95_000_000, cargoCapacityKg: 12_000, fuelConsumptionPer100Km: 28.0, tankCapacityLiters: 200, sleeperCabinAvailable: true },
  { brand: 'Volkswagen', model: 'Constellation', category: 'camion_grande', basePrice: 105_000_000, cargoCapacityKg: 14_000, fuelConsumptionPer100Km: 30.0, tankCapacityLiters: 220, sleeperCabinAvailable: true },
  { brand: 'Scania', model: 'P-series (rígido)', category: 'camion_grande', basePrice: 118_000_000, cargoCapacityKg: 15_000, fuelConsumptionPer100Km: 32.0, tankCapacityLiters: 250, sleeperCabinAvailable: true },

  // Camiones articulados (siempre con cucheta: son de larga distancia)
  { brand: 'Scania', model: 'R-series', category: 'camion_articulado', basePrice: 165_000_000, cargoCapacityKg: 28_000, fuelConsumptionPer100Km: 38.0, tankCapacityLiters: 400, sleeperCabinAvailable: true },
  { brand: 'Volvo', model: 'FH', category: 'camion_articulado', basePrice: 172_000_000, cargoCapacityKg: 29_000, fuelConsumptionPer100Km: 40.0, tankCapacityLiters: 400, sleeperCabinAvailable: true },
  { brand: 'Mercedes-Benz', model: 'Actros', category: 'camion_articulado', basePrice: 168_000_000, cargoCapacityKg: 30_000, fuelConsumptionPer100Km: 42.0, tankCapacityLiters: 400, sleeperCabinAvailable: true },
]

export interface VehicleListing {
  id: string
  brand: string
  model: string
  category: VehicleCategory
  condition: 'nuevo' | 'usado'
  price: number
  /** 0-100. En nuevos siempre 100. En usados, uno de un set fijo de valores. */
  mechanicalCondition: number
  mileageKm: number
  cargoCapacityKg: number
  fuelConsumptionPer100Km: number
  tankCapacityLiters: number
  currentFuelLiters: number
  rangeKm: number
  requiredLicense: LicenseClass
  axleConfig: AxleConfig
  wheelCount: number
  hasSleeperCabin: boolean
  maintenanceCostPerKm: number
  averageSpeedKmh: number
}

const USED_CONDITION_VALUES = [30, 40, 50, 65, 80]
const MAX_MILEAGE_BY_CATEGORY: Record<VehicleCategory, number> = {
  mini_furgon: 220_000,
  furgon: 280_000,
  furgon_grande: 350_000,
  camion_mediano: 450_000,
  camion_grande: 650_000,
  camion_articulado: 900_000,
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function buildListing(base: BaseModel, condition: 'nuevo' | 'usado'): VehicleListing {
  const categoryInfo = VEHICLE_CATEGORIES[base.category]
  const mechanicalCondition = condition === 'nuevo' ? 100 : pick(USED_CONDITION_VALUES)

  // Usado siempre más barato que nuevo, y peor estado mecánico = más barato todavía.
  const priceFactor = condition === 'nuevo' ? 1 : 0.4 + 0.4 * (mechanicalCondition / 100)
  const price = Math.round((base.basePrice * priceFactor) / 10_000) * 10_000

  const maxMileage = MAX_MILEAGE_BY_CATEGORY[base.category]
  const mileageKm =
    condition === 'nuevo' ? 0 : Math.round((((100 - mechanicalCondition) / 100) * maxMileage * (0.7 + Math.random() * 0.6)) / 100) * 100

  // No siempre lo entregan con el tanque lleno.
  const fuelFraction = condition === 'nuevo' ? 0.8 + Math.random() * 0.2 : 0.2 + Math.random() * 0.8
  const currentFuelLiters = Math.round(base.tankCapacityLiters * fuelFraction)

  const hasSleeperCabin = base.sleeperCabinAvailable && (base.category === 'camion_articulado' || Math.random() > 0.5)

  return {
    id: crypto.randomUUID(),
    brand: base.brand,
    model: base.model,
    category: base.category,
    condition,
    price,
    mechanicalCondition,
    mileageKm,
    cargoCapacityKg: base.cargoCapacityKg,
    fuelConsumptionPer100Km: base.fuelConsumptionPer100Km,
    tankCapacityLiters: base.tankCapacityLiters,
    currentFuelLiters,
    rangeKm: Math.round((base.tankCapacityLiters / base.fuelConsumptionPer100Km) * 100),
    requiredLicense: categoryInfo.requiredLicense,
    axleConfig: categoryInfo.axleConfig,
    wheelCount: categoryInfo.wheelCount,
    hasSleeperCabin,
    maintenanceCostPerKm: categoryInfo.maintenanceCostPerKm,
    averageSpeedKmh: categoryInfo.averageSpeedKmh,
  }
}

/** Genera el mercado de flota: un usado y un 0km por cada modelo base, ordenable por precio. */
export function generateVehicleMarket(): VehicleListing[] {
  const listings = BASE_MODELS.flatMap((base) => [buildListing(base, 'usado'), buildListing(base, 'nuevo')])
  return listings.sort((a, b) => a.price - b.price)
}
