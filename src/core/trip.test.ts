import { describe, expect, it } from 'vitest'
import { REFUEL_STOP_DURATION_MS } from './fuel'
import { buildRouteData } from './route'
import { computeTripState, estimateArrivalTimestamp, type FuelStop, type Trip } from './trip'

// Ruta recta de 111km (1 grado de latitud) para que las cuentas sean fáciles de verificar a mano.
const route = buildRouteData('a', 'b', [
  [0, 0],
  [0, 1],
])

function makeTrip(
  departureTimestamp: number,
  averageSpeedKmh: number,
  options: { startingFuelLiters?: number; fuelConsumptionPer100Km?: number; fuelStops?: FuelStop[] } = {},
): Trip {
  return {
    id: 't1',
    vehicleId: 'v1',
    route,
    departureTimestamp,
    estimatedArrivalTimestamp: estimateArrivalTimestamp(departureTimestamp, route.distanceTotalKm, averageSpeedKmh),
    averageSpeedKmh,
    cargoCategory: 'Paquetería',
    payout: 100_000,
    startingFuelLiters: options.startingFuelLiters ?? 100,
    fuelConsumptionPer100Km: options.fuelConsumptionPer100Km ?? 10,
    fuelStops: options.fuelStops ?? [],
  }
}

describe('computeTripState', () => {
  it('está en el origen apenas sale (elapsed = 0)', () => {
    const now = 1_000_000
    const trip = makeTrip(now, 100)
    const state = computeTripState(trip, now)

    expect(state.status).toBe('in_transit')
    expect(state.distanceTravelledKm).toBe(0)
    expect(state.progress).toBe(0)
  })

  it('a mitad de la duración total, recorrió ~la mitad de la distancia', () => {
    const departure = 0
    const speed = 100 // km/h
    const totalDurationMs = (route.distanceTotalKm / speed) * 3600 * 1000
    const trip = makeTrip(departure, speed)

    const state = computeTripState(trip, totalDurationMs / 2)

    expect(state.status).toBe('in_transit')
    expect(state.progress).toBeCloseTo(0.5, 5)
    expect(state.distanceTravelledKm).toBeCloseTo(route.distanceTotalKm / 2, 5)
  })

  it('llega exactamente a destino cuando pasó la duración total', () => {
    const departure = 0
    const speed = 100
    const totalDurationMs = (route.distanceTotalKm / speed) * 3600 * 1000
    const trip = makeTrip(departure, speed)

    const state = computeTripState(trip, totalDurationMs)

    expect(state.status).toBe('arrived')
    expect(state.progress).toBeCloseTo(1, 5)
    expect(state.remainingKm).toBeCloseTo(0, 5)
  })

  it('no sobrepasa el destino aunque pase mucho más tiempo del necesario (offline prolongado)', () => {
    const departure = 0
    const speed = 100
    const trip = makeTrip(departure, speed)

    // Simula haber cerrado el juego una semana con el viaje en curso.
    const oneWeekMs = 7 * 24 * 3600 * 1000
    const state = computeTripState(trip, oneWeekMs)

    expect(state.status).toBe('arrived')
    expect(state.distanceTravelledKm).toBeCloseTo(route.distanceTotalKm, 5)
    expect(state.position[1]).toBeCloseTo(1, 3) // llegó al destino [0, 1]
  })

  it('es determinista: mismo trip + mismo now siempre da el mismo resultado', () => {
    const trip = makeTrip(1_700_000_000_000, 87)
    const now = 1_700_000_050_000
    const a = computeTripState(trip, now)
    const b = computeTripState(trip, now)
    expect(a).toEqual(b)
  })

  it('el combustible baja con la distancia recorrida', () => {
    const departure = 0
    const speed = 100
    // 10 L/100km sobre 111km ≈ 11.1L consumidos en total.
    const trip = makeTrip(departure, speed, { startingFuelLiters: 100, fuelConsumptionPer100Km: 10 })
    const totalDurationMs = (route.distanceTotalKm / speed) * 3600 * 1000

    const half = computeTripState(trip, totalDurationMs / 2)
    expect(half.fuelLiters).toBeCloseTo(100 - (route.distanceTotalKm / 2 / 100) * 10, 5)

    const end = computeTripState(trip, totalDurationMs)
    expect(end.fuelLiters).toBeCloseTo(100 - (route.distanceTotalKm / 100) * 10, 5)
  })

  it('durante una parada de combustible el vehículo queda congelado en su distancia y el combustible sube en vivo', () => {
    const departure = 0
    const speed = 100
    const stopDistanceKm = route.distanceTotalKm / 2
    const drivingMsToStop = (stopDistanceKm / speed) * 3600 * 1000
    const arrivalTimestamp = departure + drivingMsToStop
    const stop: FuelStop = {
      gasStationId: 'gs-1',
      atDistanceKm: stopDistanceKm,
      litersAdded: 40,
      cost: 400_000,
      arrivalTimestamp,
      departureTimestamp: arrivalTimestamp + REFUEL_STOP_DURATION_MS,
      paid: false,
    }
    const trip = makeTrip(departure, speed, { startingFuelLiters: 20, fuelConsumptionPer100Km: 10, fuelStops: [stop] })

    // Justo al llegar a la parada: nada de lo agregado todavía.
    const atArrival = computeTripState(trip, arrivalTimestamp)
    expect(atArrival.status).toBe('refueling')
    expect(atArrival.distanceTravelledKm).toBeCloseTo(stopDistanceKm, 5)
    expect(atArrival.refuelProgress).toBeCloseTo(0, 5)
    const fuelAtArrival = 20 - (stopDistanceKm / 100) * 10
    expect(atArrival.fuelLiters).toBeCloseTo(fuelAtArrival, 5)

    // A mitad de los 5 minutos: la mitad de los litros ya está cargada.
    const midStop = computeTripState(trip, arrivalTimestamp + REFUEL_STOP_DURATION_MS / 2)
    expect(midStop.status).toBe('refueling')
    expect(midStop.distanceTravelledKm).toBeCloseTo(stopDistanceKm, 5) // no avanza mientras repostando
    expect(midStop.fuelLiters).toBeCloseTo(fuelAtArrival + 20, 5) // mitad de los 40L

    // Termina la parada: sigue viaje con el tanque ya cargado.
    const justAfter = computeTripState(trip, stop.departureTimestamp + 1000)
    expect(justAfter.status).toBe('in_transit')
    expect(justAfter.distanceTravelledKm).toBeGreaterThan(stopDistanceKm)
    expect(justAfter.fuelLiters).toBeGreaterThan(fuelAtArrival + 40 - 1) // recién salió, casi sin consumir de nuevo
  })
})
