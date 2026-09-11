export interface GarageTier {
  id: string
  name: string
  vehicleCapacity: number
  cost: number
  fuelTankCapacityLiters: number
  /** Si es null, está disponible desde el arranque. Si no, es el motivo del bloqueo (para mostrar en UI). */
  lockedReason: string | null
}

export const GARAGE_TIERS: GarageTier[] = [
  {
    id: 'pequeno',
    name: 'Garage pequeño',
    vehicleCapacity: 5,
    cost: 10_000_000,
    fuelTankCapacityLiters: 2_000,
    lockedReason: null,
  },
  {
    id: 'mediano',
    name: 'Garage mediano',
    vehicleCapacity: 15,
    cost: 40_000_000,
    fuelTankCapacityLiters: 6_000,
    lockedReason: 'Se desbloquea al crecer tu flota',
  },
  {
    id: 'grande',
    name: 'Garage grande',
    vehicleCapacity: 40,
    cost: 100_000_000,
    fuelTankCapacityLiters: 15_000,
    lockedReason: 'Se desbloquea al crecer tu flota',
  },
]

export interface Garage {
  id: string
  tierId: string
  cityId: string
  fuelLiters: number
}
