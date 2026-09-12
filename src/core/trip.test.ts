import { describe, expect, it } from 'vitest'
import { fuelForDistanceKm, REFUEL_STOP_DURATION_MS } from './fuel'
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
  options: {
    startingFuelLiters?: number
    fuelConsumptionPer100Km?: number
    fuelStops?: FuelStop[]
    startingDistanceKm?: number
  } = {},
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
    startingDistanceKm: options.startingDistanceKm ?? 0,
    totalFuelCostPaid: 0,
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

  it('durante una parada de combustible el vehículo queda congelado en su distancia y el combustible sube en vivo (gasolinera exactamente sobre la ruta)', () => {
    const departure = 0
    const speed = 100
    const stopDistanceKm = route.distanceTotalKm / 2
    const drivingMsToStop = (stopDistanceKm / speed) * 3600 * 1000
    const arrivalTimestamp = departure + drivingMsToStop
    const stop: FuelStop = {
      gasStationId: 'gs-1',
      atDistanceKm: stopDistanceKm,
      stationLat: 0.5,
      stationLon: 0,
      detourOneWayKm: 0, // gasolinera exactamente sobre la ruta: sin tiempo de desvío, solo los 5 min fijos
      detourResolvedAt: arrivalTimestamp, // ya resuelto justo al llegar — no queda esperando
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
    expect(midStop.position).toEqual([0, 0.5]) // sin desvío, se queda en el punto de la ruta = la gasolinera

    // Termina la parada: sigue viaje con el tanque ya cargado.
    const justAfter = computeTripState(trip, stop.departureTimestamp + 1000)
    expect(justAfter.status).toBe('in_transit')
    expect(justAfter.distanceTravelledKm).toBeGreaterThan(stopDistanceKm)
    expect(justAfter.fuelLiters).toBeGreaterThan(fuelAtArrival + 40 - 1) // recién salió, casi sin consumir de nuevo
  })

  it('con un desvío real (gasolinera lejos de la ruta) anima ida -> carga -> vuelta dentro de la misma ventana', () => {
    const departure = 0
    const speed = 100
    const stopDistanceKm = route.distanceTotalKm / 2
    const drivingMsToStop = (stopDistanceKm / speed) * 3600 * 1000
    const arrivalTimestamp = departure + drivingMsToStop
    const detourOneWayKm = 20 // bien lejos de la ruta — no es "de paso"
    const detourLegMs = (detourOneWayKm / speed) * 3600 * 1000
    const departureTimestamp = arrivalTimestamp + detourLegMs + REFUEL_STOP_DURATION_MS + detourLegMs
    const stop: FuelStop = {
      gasStationId: 'gs-lejos',
      atDistanceKm: stopDistanceKm,
      stationLat: 0.5,
      stationLon: 0.3, // bien al costado de la ruta (que va por lon=0)
      detourOneWayKm,
      detourResolvedAt: arrivalTimestamp, // ya resuelto justo al llegar — no queda esperando
      litersAdded: 40,
      cost: 400_000,
      arrivalTimestamp,
      departureTimestamp,
      paid: false,
    }
    const trip = makeTrip(departure, speed, { startingFuelLiters: 20, fuelConsumptionPer100Km: 10, fuelStops: [stop] })

    // Justo al llegar al punto de la ruta: arranca el desvío de ida, todavía en el punto de la ruta.
    const atArrival = computeTripState(trip, arrivalTimestamp)
    expect(atArrival.status).toBe('refueling')
    expect(atArrival.position).toEqual([0, 0.5])

    // A mitad del desvío de ida: a medio camino entre la ruta y la gasolinera, combustible bajando.
    const midOut = computeTripState(trip, arrivalTimestamp + detourLegMs / 2)
    expect(midOut.position[0]).toBeGreaterThan(0)
    expect(midOut.position[0]).toBeLessThan(0.3)
    const fuelAtArrival = 20 - (stopDistanceKm / 100) * 10
    expect(midOut.fuelLiters).toBeLessThan(fuelAtArrival)
    expect(midOut.fuelLiters).toBeGreaterThan(fuelAtArrival - fuelForDistanceKm(detourOneWayKm, 10))

    // Ya en la gasolinera, a mitad de la carga: mitad de los litros ya cargados.
    const midPump = computeTripState(trip, arrivalTimestamp + detourLegMs + REFUEL_STOP_DURATION_MS / 2)
    expect(midPump.position).toEqual([0.3, 0.5]) // quieto en la gasolinera
    const fuelAtStation = fuelAtArrival - fuelForDistanceKm(detourOneWayKm, 10)
    expect(midPump.fuelLiters).toBeCloseTo(fuelAtStation + 20, 5) // mitad de los 40L

    // A mitad del desvío de VUELTA: ya arrancó a volver, gastando combustible de nuevo.
    const pumpEndTimestamp = departureTimestamp - detourLegMs
    const midBack = computeTripState(trip, pumpEndTimestamp + detourLegMs / 2)
    expect(midBack.position[0]).toBeGreaterThan(0)
    expect(midBack.position[0]).toBeLessThan(0.3)
    const fuelAfterRefuel = fuelAtStation + 40
    expect(midBack.fuelLiters).toBeLessThan(fuelAfterRefuel)

    // Termina la parada: de vuelta en el punto de la ruta, sigue viaje.
    const justAfter = computeTripState(trip, departureTimestamp + 1000)
    expect(justAfter.status).toBe('in_transit')
    expect(justAfter.distanceTravelledKm).toBeGreaterThan(stopDistanceKm)
    // El combustible con el que sigue viaje ya descontó AMBOS tramos del desvío (ida y vuelta).
    const fuelAfterReturnLeg = fuelAfterRefuel - fuelForDistanceKm(detourOneWayKm, 10)
    expect(justAfter.fuelLiters).toBeLessThan(fuelAfterReturnLeg + 1)
    expect(justAfter.fuelLiters).toBeGreaterThan(fuelAfterReturnLeg - 1)
  })

  it('si la parada agendada queda detrás de la posición actual, viaja hacia atrás para llegar', () => {
    const speed = 100
    const startingDistanceKm = 80 // arrancó este tramo ya bastante avanzado
    const stopDistanceKm = 30 // pero la gasolinera alcanzable más cercana había quedado atrás
    const backwardDrivingMs = (Math.abs(startingDistanceKm - stopDistanceKm) / speed) * 3600 * 1000
    const arrivalTimestamp = backwardDrivingMs
    const stop: FuelStop = {
      gasStationId: 'gs-behind',
      atDistanceKm: stopDistanceKm,
      stationLat: 0.27,
      stationLon: 0.01,
      detourOneWayKm: 0,
      detourResolvedAt: arrivalTimestamp, // ya resuelto justo al llegar — no queda esperando
      litersAdded: 90,
      cost: 900_000,
      arrivalTimestamp,
      departureTimestamp: arrivalTimestamp + REFUEL_STOP_DURATION_MS,
      paid: false,
    }
    const trip = makeTrip(0, speed, {
      startingFuelLiters: 5,
      fuelConsumptionPer100Km: 10,
      fuelStops: [stop],
      startingDistanceKm,
    })

    // A mitad de camino hacia la parada: la distancia recorrida BAJA (va hacia atrás), no sube.
    const midway = computeTripState(trip, backwardDrivingMs / 2)
    expect(midway.status).toBe('in_transit')
    expect(midway.distanceTravelledKm).toBeLessThan(startingDistanceKm)
    expect(midway.distanceTravelledKm).toBeGreaterThan(stopDistanceKm)
    expect(midway.upcomingFuelStop?.gasStationId).toBe('gs-behind')

    // Al llegar: la distancia recorrida quedó exactamente en la de la parada, y arranca a repostar normal.
    const atArrival = computeTripState(trip, arrivalTimestamp)
    expect(atArrival.status).toBe('refueling')
    expect(atArrival.distanceTravelledKm).toBeCloseTo(stopDistanceKm, 5)
  })

  it('también expone la parada agendada mientras viaja HACIA ADELANTE hacia ella (no solo hacia atrás)', () => {
    // Este es el caso más común: la gasolinera alcanzable está más adelante en la
    // ruta. `upcomingFuelStop` debe verse desde el instante en que se agenda, no
    // recién cuando ya se llega — si no, el desvío verde del mapa no aparece hasta
    // que el vehículo está a punto de parar (ver DashboardMap.tsx).
    const speed = 100
    const stopDistanceKm = route.distanceTotalKm / 2
    const drivingMs = (stopDistanceKm / speed) * 3600 * 1000
    const stop: FuelStop = {
      gasStationId: 'gs-ahead',
      atDistanceKm: stopDistanceKm,
      stationLat: 0.5,
      stationLon: 0.01,
      detourOneWayKm: 0,
      litersAdded: 40,
      cost: 400_000,
      arrivalTimestamp: drivingMs,
      departureTimestamp: drivingMs + REFUEL_STOP_DURATION_MS,
      paid: false,
    }
    const trip = makeTrip(0, speed, { fuelStops: [stop] })

    const justDeparted = computeTripState(trip, 1000)
    expect(justDeparted.status).toBe('in_transit')
    expect(justDeparted.upcomingFuelStop?.gasStationId).toBe('gs-ahead')

    const midway = computeTripState(trip, drivingMs / 2)
    expect(midway.upcomingFuelStop?.gasStationId).toBe('gs-ahead')
  })

  it('se queda "varado" (stranded) si el combustible se acaba antes de llegar, sin ninguna parada agendada', () => {
    // 5L a 10L/100km = 50km de autonomía — la ruta mide ~111km y no hay ninguna
    // parada agendada (el caso "no había ninguna gasolinera alcanzable").
    const speed = 100
    const trip = makeTrip(0, speed, { startingFuelLiters: 5, fuelConsumptionPer100Km: 10 })

    const autonomyKm = 50 // 5L / 10L*100km
    const timeToRunOutMs = (autonomyKm / speed) * 3_600_000

    const justBeforeRunningOut = computeTripState(trip, timeToRunOutMs - 1000)
    expect(justBeforeRunningOut.status).toBe('in_transit')

    const justAfterRunningOut = computeTripState(trip, timeToRunOutMs + 1000)
    expect(justAfterRunningOut.status).toBe('stranded')
    expect(justAfterRunningOut.distanceTravelledKm).toBeCloseTo(autonomyKm, 3)
    expect(justAfterRunningOut.fuelLiters).toBeCloseTo(0, 5)

    // Mucho después: sigue exactamente en el mismo lugar, no "seguía viajando" solo.
    const muchLater = computeTripState(trip, timeToRunOutMs + 3 * 3_600_000)
    expect(muchLater.status).toBe('stranded')
    expect(muchLater.distanceTravelledKm).toBeCloseTo(autonomyKm, 3)
    expect(muchLater.fuelLiters).toBeCloseTo(0, 5)
  })

  it('también se puede quedar varado yendo hacia atrás, a mitad de camino de vuelta a una parada', () => {
    const speed = 100
    const startingDistanceKm = 20
    const trip = makeTrip(0, speed, {
      startingFuelLiters: 1, // 10km de autonomía — no alcanza para volver los 20km hasta la parada
      fuelConsumptionPer100Km: 10,
      startingDistanceKm,
      fuelStops: [
        {
          gasStationId: 'gs-atras',
          atDistanceKm: 0,
          stationLat: 0,
          stationLon: -1,
          detourOneWayKm: 5,
          litersAdded: 40,
          cost: 400_000,
          arrivalTimestamp: 100_000_000, // muy en el futuro — nunca se llega a tiempo
          departureTimestamp: 200_000_000,
          paid: false,
        },
      ],
    })

    const farLater = computeTripState(trip, 10 * 3_600_000)
    expect(farLater.status).toBe('stranded')
    expect(farLater.distanceTravelledKm).toBeCloseTo(startingDistanceKm - 10, 3)
  })

  it('se queda esperando en el punto de la ruta (sin manejar por ninguna línea) hasta que se resuelve la ruta real al desvío', () => {
    const speed = 100
    const stopDistanceKm = route.distanceTotalKm / 2
    const drivingMsToStop = (stopDistanceKm / speed) * 3600 * 1000
    const arrivalTimestamp = drivingMsToStop
    const detourOneWayKm = 20
    const stop: FuelStop = {
      gasStationId: 'gs-lejos',
      atDistanceKm: stopDistanceKm,
      stationLat: 0.5,
      stationLon: 0.3,
      detourOneWayKm,
      // detourResolvedAt sin setear a propósito: todavía no contestó el servicio de ruteo.
      litersAdded: 40,
      cost: 400_000,
      arrivalTimestamp,
      departureTimestamp: arrivalTimestamp + REFUEL_STOP_DURATION_MS,
      paid: false,
    }
    const trip = makeTrip(0, speed, { startingFuelLiters: 20, fuelConsumptionPer100Km: 10, fuelStops: [stop] })

    const atArrival = computeTripState(trip, arrivalTimestamp)
    expect(atArrival.status).toBe('refueling')
    expect(atArrival.refuelPhase).toBe('waiting_for_route')
    expect(atArrival.position).toEqual([0, 0.5]) // quieto en el punto de la ruta, no en ningún lado del desvío
    const fuelAtArrival = 20 - (stopDistanceKm / 100) * 10
    expect(atArrival.fuelLiters).toBeCloseTo(fuelAtArrival, 5)

    // Mucho después, si la ruta NUNCA resuelve, se sigue quedando ahí esperando (no avanza solo).
    const muchLater = computeTripState(trip, arrivalTimestamp + 3 * 3_600_000)
    expect(muchLater.status).toBe('refueling')
    expect(muchLater.refuelPhase).toBe('waiting_for_route')
    expect(muchLater.position).toEqual([0, 0.5])
    expect(muchLater.fuelLiters).toBeCloseTo(fuelAtArrival, 5) // no gasta combustible esperando

    // Una vez que se resuelve (Dashboard.tsx setea `detourResolvedAt`), recién ahí arranca
    // a manejar el desvío de ida — anclado a `detourResolvedAt`, no a `arrivalTimestamp`.
    const resolvedAt = arrivalTimestamp + 3 * 3_600_000
    const resolvedStop: FuelStop = { ...stop, detourResolvedAt: resolvedAt }
    const resolvedTrip = { ...trip, fuelStops: [resolvedStop] }

    const rightAtResolution = computeTripState(resolvedTrip, resolvedAt)
    expect(rightAtResolution.refuelPhase).toBe('to_station')
    expect(rightAtResolution.position).toEqual([0, 0.5]) // recién arranca, todavía en el punto de la ruta

    const detourLegMs = (detourOneWayKm / speed) * 3_600_000
    const midOut = computeTripState(resolvedTrip, resolvedAt + detourLegMs / 2)
    expect(midOut.refuelPhase).toBe('to_station')
    expect(midOut.position[0]).toBeGreaterThan(0)
    expect(midOut.position[0]).toBeLessThan(0.3)
  })
})
