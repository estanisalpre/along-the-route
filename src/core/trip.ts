import { fuelForDistanceKm, REFUEL_STOP_DURATION_MS } from './fuel'
import type { LonLat } from './geo'
import { positionAtDistance, type RouteData } from './route'

export interface FuelStop {
  gasStationId: string
  /** Distancia acumulada (km) de la ruta en la que ocurre la parada. */
  atDistanceKm: number
  litersAdded: number
  /** Precio de la gasolinera al momento de aceptar el viaje (ver docs/FUEL_MECHANICS.md — no se
   *  recalcula con el precio real del momento en que el vehículo llega). */
  cost: number
  arrivalTimestamp: number
  departureTimestamp: number
  /** Si ya se descontó de la caja de la empresa (lo marca el tick de Dashboard.tsx, una sola vez). */
  paid: boolean
}

export interface Trip {
  id: string
  vehicleId: string
  route: RouteData
  departureTimestamp: number
  /** Hora "prometida" de llegada, fija desde que sale el vehículo (incluye el tiempo de manejo Y las
   *  paradas de combustible ya agendadas). */
  estimatedArrivalTimestamp: number
  averageSpeedKmh: number
  cargoCategory: string
  payout: number
  /** Combustible con el que salió el vehículo (litros) — junto con `fuelConsumptionPer100Km` alcanza
   *  para reconstruir el nivel de combustible en cualquier momento del viaje. */
  startingFuelLiters: number
  /** Consumo efectivo (L/100km) a la velocidad de crucero elegida — fijo para todo el viaje. */
  fuelConsumptionPer100Km: number
  /** Paradas a repostar ya agendadas al aceptar el viaje (puede ser []), ordenadas por distancia. */
  fuelStops: FuelStop[]
}

export function estimateArrivalTimestamp(departureTimestamp: number, distanceTotalKm: number, averageSpeedKmh: number): number {
  return departureTimestamp + (distanceTotalKm / averageSpeedKmh) * 3_600_000
}

export interface TripState {
  status: 'in_transit' | 'refueling' | 'arrived'
  distanceTravelledKm: number
  /** 0-1 */
  progress: number
  position: LonLat
  bearing: number
  remainingKm: number
  /** Combustible actual (litros) — baja mientras viaja, sube en vivo durante una parada. */
  fuelLiters: number
  /** Solo si `status === 'refueling'`: 0-1, para animar la carga en vivo. */
  refuelProgress?: number
  /** Solo si `status === 'refueling'`: la parada activa. */
  activeFuelStop?: FuelStop
}

/**
 * Calcula el estado de un viaje en un instante dado, únicamente a partir de
 * `departureTimestamp` + velocidad + geometría de la ruta + las paradas de
 * combustible ya agendadas. No depende de que el juego haya estado corriendo
 * entre `trip.departureTimestamp` y `now`: sirve exactamente igual para
 * animar en vivo (now = tick actual) que para reconstruir el estado después
 * de haber cerrado y reabierto el juego (now = timestamp al reabrir).
 *
 * Las paradas de combustible "congelan" la distancia recorrida durante su
 * ventana de tiempo (el vehículo no avanza mientras repostando) y retrasan
 * todo lo que viene después — por eso se recorren en orden, arrastrando un
 * "cursor" de distancia/tiempo/combustible en vez de calcular todo de una.
 */
export function computeTripState(trip: Trip, now: number): TripState {
  let cursorTimestamp = trip.departureTimestamp
  let cursorDistanceKm = 0
  let cursorFuelLiters = trip.startingFuelLiters

  for (const stop of trip.fuelStops) {
    if (now < stop.arrivalTimestamp) break // todavía viajando hacia esta parada — se resuelve abajo

    const fuelAtArrival = cursorFuelLiters - fuelForDistanceKm(stop.atDistanceKm - cursorDistanceKm, trip.fuelConsumptionPer100Km)

    if (now < stop.departureTimestamp) {
      const refuelProgress = (now - stop.arrivalTimestamp) / (stop.departureTimestamp - stop.arrivalTimestamp)
      const { position, bearing } = positionAtDistance(trip.route, stop.atDistanceKm)
      return {
        status: 'refueling',
        distanceTravelledKm: stop.atDistanceKm,
        progress: stop.atDistanceKm / trip.route.distanceTotalKm,
        position,
        bearing,
        remainingKm: trip.route.distanceTotalKm - stop.atDistanceKm,
        // El tanque nunca debería quedar en negativo — si pasa (ej. el jugador bajó
        // `refuelTargetLiters` después de que ya se agendó la parada), se lo recorta
        // en 0 en vez de mostrar un número sin sentido.
        fuelLiters: Math.max(0, fuelAtArrival + stop.litersAdded * refuelProgress),
        refuelProgress,
        activeFuelStop: stop,
      }
    }

    cursorTimestamp = stop.departureTimestamp
    cursorDistanceKm = stop.atDistanceKm
    cursorFuelLiters = fuelAtArrival + stop.litersAdded
  }

  const elapsedHours = Math.max(0, (now - cursorTimestamp) / 1000 / 3600)
  const distanceTravelledKm = Math.min(
    cursorDistanceKm + trip.averageSpeedKmh * elapsedHours,
    trip.route.distanceTotalKm,
  )
  // Igual que arriba: nunca en negativo, aunque el vehículo se haya quedado
  // sin combustible de verdad (ver docs/FUEL_MECHANICS.md) — se muestra 0, no
  // un número negativo sin sentido.
  const fuelLiters = Math.max(
    0,
    cursorFuelLiters - fuelForDistanceKm(distanceTravelledKm - cursorDistanceKm, trip.fuelConsumptionPer100Km),
  )
  const { position, bearing } = positionAtDistance(trip.route, distanceTravelledKm)

  return {
    status: distanceTravelledKm >= trip.route.distanceTotalKm ? 'arrived' : 'in_transit',
    distanceTravelledKm,
    progress: distanceTravelledKm / trip.route.distanceTotalKm,
    position,
    bearing,
    remainingKm: trip.route.distanceTotalKm - distanceTravelledKm,
    fuelLiters,
  }
}

/** Cuánto dura el viaje completo (manejo + paradas), para mostrar la llegada estimada. */
export function estimateArrivalWithStops(
  departureTimestamp: number,
  distanceTotalKm: number,
  averageSpeedKmh: number,
  stopCount: number,
): number {
  return estimateArrivalTimestamp(departureTimestamp, distanceTotalKm, averageSpeedKmh) + stopCount * REFUEL_STOP_DURATION_MS
}
