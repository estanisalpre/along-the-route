import { describe, expect, it } from 'vitest'
import { fuelForDistanceKm } from './fuel'
import { haversineDistanceKm } from './geo'
import type { GasStation } from './gasStation'
import {
  adjustTripFuel,
  cancelFuelStop,
  findNearestGasStation,
  planFuelStops,
  replanTripFuel,
  resolveTowTruck,
  scheduleFuelStops,
} from './fuelPlan'
import { buildRouteData, positionAtDistance } from './route'
import { computeTripState, type Trip } from './trip'

// Ruta recta de 111km (1 grado de latitud), igual que en trip.test.ts.
const route = buildRouteData('a', 'b', [
  [0, 0],
  [0, 1],
])

const STATIONS: GasStation[] = [{ id: 'gs-mid', brand: 'Jhell', lat: 0.5, lon: 0, nearCityId: 'x' }]

function makeBaseTrip(overrides: Partial<Trip> = {}): Trip {
  const departureTimestamp = 0
  const averageSpeedKmh = 100
  return {
    id: 't1',
    vehicleId: 'v1',
    route,
    departureTimestamp,
    estimatedArrivalTimestamp: departureTimestamp + (route.distanceTotalKm / averageSpeedKmh) * 3_600_000,
    averageSpeedKmh,
    cargoCategory: 'Paquetería',
    payout: 100_000,
    startingFuelLiters: 100,
    fuelConsumptionPer100Km: 10,
    fuelStops: [],
    startingDistanceKm: 0,
    totalFuelCostPaid: 0,
    ...overrides,
  }
}

describe('findNearestGasStation', () => {
  it('elige la más cercana en línea recta, sin importar si está lejos de cualquier ruta', () => {
    const stations: GasStation[] = [
      { id: 'lejos', brand: 'Jhell', lat: 10, lon: 10, nearCityId: 'x' },
      { id: 'cerca', brand: 'PFY', lat: 0.01, lon: 0.01, nearCityId: 'y' },
    ]
    const nearest = findNearestGasStation([0, 0], stations)
    expect(nearest?.id).toBe('cerca')
  })

  it('devuelve undefined si no hay ninguna gasolinera', () => {
    expect(findNearestGasStation([0, 0], [])).toBeUndefined()
  })
})

describe('planFuelStops', () => {
  it('prioriza la gasolinera geográficamente más cercana aunque exista una más lejana sobre el camino', () => {
    // El vehículo está a mitad de ruta. Hay una gasolinera "de paso" más adelante
    // sobre el mismo camino (a ~25km), y otra bien más cerca en línea recta pero
    // fuera del camino (a un costado, a ~3.3km) — con autonomía para llegar a
    // cualquiera de las dos, tiene que ganar la geográficamente más cercana.
    const positionKm = route.distanceTotalKm / 2
    const vehiclePosition = positionAtDistance(route, positionKm).position
    const onRoutePoint = positionAtDistance(route, positionKm + 25).position

    const onRouteButFar: GasStation = { id: 'gs-lejos-en-ruta', brand: 'Jhell', lat: onRoutePoint[1], lon: onRoutePoint[0], nearCityId: 'x' }
    const offRouteButNear: GasStation = {
      id: 'gs-cerca-fuera-de-ruta',
      brand: 'PFY',
      lat: vehiclePosition[1],
      lon: vehiclePosition[0] + 0.03, // unos ~3.3km al costado, nada "de paso"
      nearCityId: 'y',
    }
    const distanceToFar = haversineDistanceKm(vehiclePosition, [onRouteButFar.lon, onRouteButFar.lat])
    const distanceToNear = haversineDistanceKm(vehiclePosition, [offRouteButNear.lon, offRouteButNear.lat])
    expect(distanceToNear).toBeLessThan(distanceToFar) // confirma que el test está bien armado

    // 3L a 10L/100km = 30km de autonomía: no llega al destino desde acá, así que
    // hace falta una parada — y alcanzan las dos gasolineras, pero debe ganar la cercana.
    const stops = planFuelStops(route, 3, 10, 100, 100, [onRouteButFar, offRouteButNear], 1000, positionKm)
    expect(stops).toHaveLength(1)
    expect(stops[0].gasStationId).toBe('gs-cerca-fuera-de-ruta')
    expect(stops[0].detourOneWayKm).toBeCloseTo(distanceToNear, 5)
  })

  it('no busca gasolineras antes de fromDistanceKm (el punto de salida solo avanza)', () => {
    const stops = planFuelStops(route, 5, 10, 100, 100, STATIONS, 1000, 60)
    for (const stop of stops) {
      expect(stop.atDistanceKm).toBeGreaterThanOrEqual(60)
    }
  })

  it('no agenda nada si ni la más cercana está dentro del rango de autonomía', () => {
    // A 200km de la única gasolinera, con muy poco combustible: no alcanza ni para ir.
    const farStation: GasStation = { id: 'gs-lejísimos', brand: 'Jhell', lat: 5, lon: 5, nearCityId: 'z' }
    const stops = planFuelStops(route, 0.5, 10, 100, 100, [farStation], 1000, 50)
    expect(stops).toHaveLength(0)
  })

  it('descuenta el combustible de la vuelta además de la ida al planificar el siguiente tramo', () => {
    const positionKm = 0
    const vehiclePosition = positionAtDistance(route, positionKm).position
    const detourStation: GasStation = {
      id: 'gs-desvio',
      brand: 'Jhell',
      lat: vehiclePosition[1],
      lon: vehiclePosition[0] + 0.05,
      nearCityId: 'x',
    }
    const detourOneWayKm = haversineDistanceKm(vehiclePosition, [detourStation.lon, detourStation.lat])

    // Sale con 10L (10L/100km => 100km de autonomía), repostando siempre a 20L exactos.
    const stops = planFuelStops(route, 10, 10, 100, 20, [detourStation], 1000, positionKm)
    expect(stops).toHaveLength(1)

    const fuelAtStation = 10 - fuelForDistanceKm(detourOneWayKm, 10)
    const fuelAfterReturnLeg = fuelAtStation + 20 - fuelForDistanceKm(detourOneWayKm, 10)
    // La autonomía para el tramo SIGUIENTE debe salir de fuelAfterReturnLeg (con la vuelta ya
    // descontada), no de los 20L "a la salida de la gasolinera" — si acá hubiera 2 paradas en
    // vez de 1 sería la señal de que el descuento de la vuelta no se está aplicando.
    const reachWithReturnDiscounted = positionKm + (fuelAfterReturnLeg / 10) * 100
    if (reachWithReturnDiscounted < route.distanceTotalKm) {
      expect(stops.length).toBeGreaterThan(1)
    }
  })
})

describe('scheduleFuelStops', () => {
  it('calcula el tiempo de manejo desde fromDistanceKm, no desde 0, cuando la gasolinera está sobre la ruta', () => {
    const stopsByDistance = [
      { gasStationId: 'gs-mid', atDistanceKm: 110, stationLat: 0.5, stationLon: 0.01, detourOneWayKm: 0, litersAdded: 10, cost: 1000 },
    ]
    const { fuelStops } = scheduleFuelStops(stopsByDistance, 0, 100, 100)
    // De 100km a 110km a 100km/h: 0.1h = 360.000ms de manejo, sin desvío.
    expect(fuelStops[0].arrivalTimestamp).toBeCloseTo(360_000, 0)
    expect(fuelStops[0].departureTimestamp - fuelStops[0].arrivalTimestamp).toBeCloseTo(5 * 60 * 1000, 0)
  })

  it('suma ida + carga + vuelta dentro de la ventana [arrivalTimestamp, departureTimestamp) cuando hay desvío real', () => {
    const stopsByDistance = [
      { gasStationId: 'gs-desvio', atDistanceKm: 50, stationLat: 0.5, stationLon: 0.1, detourOneWayKm: 20, litersAdded: 10, cost: 1000 },
    ]
    const { fuelStops } = scheduleFuelStops(stopsByDistance, 0, 100, 0)
    const detourLegMs = (20 / 100) * 3_600_000
    expect(fuelStops[0].arrivalTimestamp).toBeCloseTo((50 / 100) * 3_600_000, 0)
    expect(fuelStops[0].departureTimestamp - fuelStops[0].arrivalTimestamp).toBeCloseTo(detourLegMs + 5 * 60 * 1000 + detourLegMs, 0)
  })
})

describe('replanTripFuel', () => {
  it('re-arranca desde la posición y combustible actuales, no desde el origen', () => {
    const trip = makeBaseTrip()
    const halfwayMs = (route.distanceTotalKm / 2 / trip.averageSpeedKmh) * 3_600_000
    const now = trip.departureTimestamp + halfwayMs

    const stateBefore = computeTripState(trip, now)
    const replanned = replanTripFuel(trip, now, 50, 100, 100, 10, 100, STATIONS, 1000)

    expect(replanned.departureTimestamp).toBe(now)
    expect(replanned.startingDistanceKm).toBeCloseTo(stateBefore.distanceTravelledKm, 5)
    expect(replanned.startingFuelLiters).toBeCloseTo(stateBefore.fuelLiters, 5)
    expect(replanned.averageSpeedKmh).toBe(50)

    // Con el nuevo plan, en el mismo instante `now` la posición no debería saltar.
    const stateAfter = computeTripState(replanned, now)
    expect(stateAfter.distanceTravelledKm).toBeCloseTo(stateBefore.distanceTravelledKm, 5)
  })

  it('bajar la velocidad de crucero atrasa la llegada estimada', () => {
    const trip = makeBaseTrip()
    const now = trip.departureTimestamp + 1000

    const slower = replanTripFuel(trip, now, 50, 100, 100, 10, 100, STATIONS, 1000)
    const faster = replanTripFuel(trip, now, 100, 100, 100, 10, 100, STATIONS, 1000)

    expect(slower.estimatedArrivalTimestamp).toBeGreaterThan(faster.estimatedArrivalTimestamp)
  })

  it('no hace nada si el vehículo ya llegó', () => {
    const trip = makeBaseTrip()
    const arrivalMs = (route.distanceTotalKm / trip.averageSpeedKmh) * 3_600_000
    const replanned = replanTripFuel(trip, trip.departureTimestamp + arrivalMs + 1, 50, 100, 100, 10, 100, STATIONS, 1000)
    expect(replanned).toBe(trip)
  })

  it('no hace nada mientras está parado repostando (se resuelve solo al terminar la parada)', () => {
    const trip = makeBaseTrip({
      fuelStops: [
        {
          gasStationId: 'gs-mid',
          atDistanceKm: 50,
          stationLat: 0.5,
          stationLon: 0.01,
          detourOneWayKm: 0,
          litersAdded: 20,
          cost: 20_000,
          arrivalTimestamp: 1000,
          departureTimestamp: 1000 + 5 * 60 * 1000,
          paid: false,
        },
      ],
    })
    const replanned = replanTripFuel(trip, 1000 + 1000, 50, 100, 100, 10, 100, STATIONS, 1000)
    expect(replanned).toBe(trip)
  })

  it('conserva en totalFuelCostPaid lo ya pagado en paradas anteriores al replanteo', () => {
    const paidStop = {
      gasStationId: 'gs-mid',
      atDistanceKm: 10,
      stationLat: 0.5,
      stationLon: 0.01,
      detourOneWayKm: 0,
      detourResolvedAt: 100, // ya resuelto justo al llegar — no queda esperando
      litersAdded: 20,
      cost: 20_000,
      arrivalTimestamp: 100,
      departureTimestamp: 100 + 5 * 60 * 1000,
      paid: true,
    }
    const trip = makeBaseTrip({ fuelStops: [paidStop], totalFuelCostPaid: 5_000 })
    const now = paidStop.departureTimestamp + 10_000
    const replanned = replanTripFuel(trip, now, 50, 100, 100, 10, 100, STATIONS, 1000)
    expect(replanned.totalFuelCostPaid).toBe(5_000 + 20_000)
  })
})

describe('adjustTripFuel', () => {
  it('no hace nada mientras está parado repostando — cada click reemplazaría la parada activa por otra en el mismo lugar, reiniciando el ciclo sin fin', () => {
    const trip = makeBaseTrip({
      fuelStops: [
        {
          gasStationId: 'gs-mid',
          atDistanceKm: 50,
          stationLat: 0.5,
          stationLon: 0.01,
          detourOneWayKm: 0,
          litersAdded: 20,
          cost: 20_000,
          arrivalTimestamp: 1000,
          departureTimestamp: 1000 + 5 * 60 * 1000,
          paid: false,
        },
      ],
    })
    const adjusted = adjustTripFuel(trip, 1000 + 1000, 1, 100, 100, STATIONS, 1000)
    expect(adjusted).toBe(trip)
  })

  it('no hace nada si el vehículo ya llegó', () => {
    const trip = makeBaseTrip()
    const arrivalMs = (route.distanceTotalKm / trip.averageSpeedKmh) * 3_600_000
    const adjusted = adjustTripFuel(trip, trip.departureTimestamp + arrivalMs + 1, 1, 100, 100, STATIONS, 1000)
    expect(adjusted).toBe(trip)
  })

  it('con delta 0, agenda una parada si hace falta — es lo que usa la vigilancia de combustible bajo de Dashboard.tsx', () => {
    // Sin ninguna parada agendada y muy poco combustible para lo que falta:
    // el mismo llamado que hace la vigilancia (delta=0) debe encontrar la
    // gasolinera más cercana y agendarla, igual que al aceptar el viaje.
    // STATIONS tiene una única gasolinera a ~55.5km del origen — con 6L (60km de
    // autonomía) no llega a destino (111km) pero sí le alcanza para ir hasta ahí.
    const trip = makeBaseTrip({ startingFuelLiters: 6, fuelConsumptionPer100Km: 10, fuelStops: [] })
    const adjusted = adjustTripFuel(trip, trip.departureTimestamp + 1000, 0, 100, 100, STATIONS, 1000)
    expect(adjusted.fuelStops.length).toBeGreaterThan(0)
  })

  it('con delta 0, no hace nada si el tanque ya alcanza para terminar el viaje', () => {
    const trip = makeBaseTrip({ startingFuelLiters: 100, fuelConsumptionPer100Km: 10, fuelStops: [] })
    const adjusted = adjustTripFuel(trip, trip.departureTimestamp + 1000, 0, 100, 100, STATIONS, 1000)
    expect(adjusted.fuelStops).toHaveLength(0)
  })

  it('NO agenda ninguna parada mientras el nivel quede por encima de LOW_FUEL_LITERS, aunque el viaje sea demasiado largo para el tanque', () => {
    // 30L con 30L/100km de consumo = 100km de autonomía — no alcanza para los
    // ~111km de la ruta (en algún momento SÍ va a hacer falta parar), pero 30L
    // está bien por encima del umbral de "combustible bajo" (10L): bajar de
    // 31 a 30 con el botón de debug no tiene que disparar ninguna búsqueda.
    const trip = makeBaseTrip({ startingFuelLiters: 31, fuelConsumptionPer100Km: 30, fuelStops: [] })
    const adjusted = adjustTripFuel(trip, trip.departureTimestamp + 1000, -1, 100, 100, STATIONS, 1000)
    expect(adjusted.fuelStops).toHaveLength(0)

    const state = computeTripState(adjusted, trip.departureTimestamp + 1000)
    expect(state.fuelLiters).toBeCloseTo(30, 1)
    expect(state.status).toBe('in_transit')
  })

  it('SÍ agenda una parada en cuanto el resultado cruza LOW_FUEL_LITERS de verdad', () => {
    const trip = makeBaseTrip({ startingFuelLiters: 11, fuelConsumptionPer100Km: 10, fuelStops: [] })
    const adjusted = adjustTripFuel(trip, trip.departureTimestamp + 1000, -1, 100, 100, STATIONS, 1000)
    expect(adjusted.fuelStops.length).toBeGreaterThan(0)
  })

  it('apaga fuelSearchSuppressed (rama alta, sin buscar gasolinera) — es una acción explícita del jugador', () => {
    const trip = makeBaseTrip({ startingFuelLiters: 31, fuelConsumptionPer100Km: 30, fuelStops: [], fuelSearchSuppressed: true })
    const adjusted = adjustTripFuel(trip, trip.departureTimestamp + 1000, -1, 100, 100, STATIONS, 1000)
    expect(adjusted.fuelSearchSuppressed).toBe(false)
  })

  it('apaga fuelSearchSuppressed (rama baja, sí busca gasolinera) — es una acción explícita del jugador', () => {
    const trip = makeBaseTrip({ startingFuelLiters: 11, fuelConsumptionPer100Km: 10, fuelStops: [], fuelSearchSuppressed: true })
    const adjusted = adjustTripFuel(trip, trip.departureTimestamp + 1000, -1, 100, 100, STATIONS, 1000)
    expect(adjusted.fuelSearchSuppressed).toBe(false)
  })
})

describe('cancelFuelStop', () => {
  const speed = 100
  const detourOneWayKm = 10
  const detourLegMs = (detourOneWayKm / speed) * 3_600_000
  const arrivalTimestamp = 1000
  const departureTimestamp = arrivalTimestamp + detourLegMs + 5 * 60 * 1000 + detourLegMs
  const baseStop = {
    gasStationId: 'gs-cancel',
    atDistanceKm: 50,
    stationLat: 0.5,
    stationLon: 0.1,
    detourOneWayKm,
    detourResolvedAt: arrivalTimestamp, // ya resuelto justo al llegar — no queda esperando
    litersAdded: 40,
    cost: 40_000,
    arrivalTimestamp,
    departureTimestamp,
    paid: false,
  }

  it('no hace nada si no hay ninguna parada activa', () => {
    const trip = makeBaseTrip({ averageSpeedKmh: speed })
    const cancelled = cancelFuelStop(trip, 500)
    expect(cancelled).toBe(trip)
  })

  it('cancela a mitad del desvío de ida: retoma la ruta con el combustible de ese momento, sin agendar nada más', () => {
    const trip = makeBaseTrip({ averageSpeedKmh: speed, fuelStops: [baseStop] })
    const midOut = arrivalTimestamp + detourLegMs / 2
    const stateBefore = computeTripState(trip, midOut)
    expect(stateBefore.refuelPhase).toBe('to_station')

    const cancelled = cancelFuelStop(trip, midOut)
    expect(cancelled.fuelStops).toHaveLength(0)
    expect(cancelled.startingDistanceKm).toBe(baseStop.atDistanceKm)
    expect(cancelled.startingFuelLiters).toBeCloseTo(stateBefore.fuelLiters, 5)
    expect(cancelled.departureTimestamp).toBe(midOut)
  })

  it('si cancela apenas arrancó el desvío (todavía prácticamente sobre la ruta), no arma ningún tramo de vuelta — sigue de una', () => {
    // Justo en el instante de arrivalTimestamp: la posición todavía coincide
    // con el punto de la ruta (t=0 del desvío de ida) — no hay nada que animar.
    const trip = makeBaseTrip({ averageSpeedKmh: speed, fuelStops: [baseStop] })
    const cancelled = cancelFuelStop(trip, arrivalTimestamp)
    expect(cancelled.returnToRouteLeg).toBeUndefined()

    // Sigue de largo por la ruta normal, sin ningún estado de "volviendo".
    const rightAfter = computeTripState(cancelled, arrivalTimestamp)
    expect(rightAfter.status).toBe('in_transit')
    expect(rightAfter.refuelPhase).toBeUndefined()
  })

  it('NO teletransporta de vuelta a la ruta: anima el regreso desde la posición real de cancelación', () => {
    const trip = makeBaseTrip({ averageSpeedKmh: speed, fuelStops: [baseStop] })
    const midOut = arrivalTimestamp + detourLegMs / 2
    const positionAtCancel = computeTripState(trip, midOut).position

    const cancelled = cancelFuelStop(trip, midOut)
    expect(cancelled.returnToRouteLeg).toBeDefined()
    expect(cancelled.returnToRouteLeg?.oneWayKm).toBeGreaterThan(0)

    // Justo al cancelar: sigue en la misma posición de cancelación, no saltó a la ruta.
    const rightAfter = computeTripState(cancelled, midOut)
    expect(rightAfter.position[0]).toBeCloseTo(positionAtCancel[0], 5)
    expect(rightAfter.position[1]).toBeCloseTo(positionAtCancel[1], 5)
    expect(rightAfter.refuelPhase).toBe('returning')

    // Recién después de manejar el tramo de vuelta llega efectivamente al punto de la ruta.
    const legMs = ((cancelled.returnToRouteLeg?.oneWayKm ?? 0) / speed) * 3_600_000
    const afterReturning = computeTripState(cancelled, midOut + legMs + 1)
    expect(afterReturning.status).toBe('in_transit')
    expect(afterReturning.distanceTravelledKm).toBeCloseTo(baseStop.atDistanceKm, 3)
  })

  it('no hace nada si ya empezó a cargar de verdad — hay que esperar a que termine sí o sí', () => {
    const trip = makeBaseTrip({ averageSpeedKmh: speed, fuelStops: [baseStop] })
    const outEnd = arrivalTimestamp + detourLegMs
    const midPump = outEnd + (5 * 60 * 1000) / 2
    const stateBefore = computeTripState(trip, midPump)
    expect(stateBefore.refuelPhase).toBe('pumping')
    expect(stateBefore.litersAddedSoFar).toBeGreaterThan(0)
    expect(stateBefore.litersAddedSoFar).toBeLessThan(baseStop.litersAdded)

    const cancelled = cancelFuelStop(trip, midPump)
    expect(cancelled).toBe(trip)
  })

  it('tampoco hace nada durante el desvío de vuelta (ya terminó de cargar, no hay nada que cancelar)', () => {
    const trip = makeBaseTrip({ averageSpeedKmh: speed, fuelStops: [baseStop] })
    const pumpEnd = departureTimestamp - detourLegMs
    const midReturn = pumpEnd + detourLegMs / 2
    const stateBefore = computeTripState(trip, midReturn)
    expect(stateBefore.refuelPhase).toBe('returning')

    const cancelled = cancelFuelStop(trip, midReturn)
    expect(cancelled).toBe(trip)
  })

  it('conserva en totalFuelCostPaid lo ya pagado antes de cancelar', () => {
    const paidStop = { ...baseStop, paid: true }
    const trip = makeBaseTrip({ averageSpeedKmh: speed, fuelStops: [paidStop], totalFuelCostPaid: 1_000 })
    const midOut = arrivalTimestamp + detourLegMs / 2
    const cancelled = cancelFuelStop(trip, midOut)
    expect(cancelled.totalFuelCostPaid).toBe(1_000 + paidStop.cost)
  })

  it('aunque al volver a la ruta no alcance para terminar el viaje, NO agenda ninguna parada nueva — cancelar es "olvidate de esto"', () => {
    // Poco combustible restante — claramente no alcanza para terminar los
    // ~111km de la ruta total. Si `cancelFuelStop` volviera a correr
    // `planFuelStops` acá, encontraría casi siempre la MISMA gasolinera de la
    // que se acaba de ir — ida y vuelta sin fin. Cancelar tiene que dejar
    // `fuelStops: []` sin importar nada más; si más adelante el combustible
    // vuelve a bajar de LOW_FUEL_LITERS de verdad, la vigilancia de
    // combustible bajo (§4.3, Dashboard.tsx) es la que se encarga, no esto.
    const trip = makeBaseTrip({ averageSpeedKmh: speed, startingFuelLiters: 10, fuelStops: [baseStop] })
    const midOut = arrivalTimestamp + detourLegMs / 2

    const cancelled = cancelFuelStop(trip, midOut)
    expect(cancelled.fuelStops).toHaveLength(0)
  })

  it('prende fuelSearchSuppressed al cancelar, para que la vigilancia de combustible bajo (§4.3) no la reagende sola', () => {
    const trip = makeBaseTrip({ averageSpeedKmh: speed, fuelStops: [baseStop] })
    const midOut = arrivalTimestamp + detourLegMs / 2
    const cancelled = cancelFuelStop(trip, midOut)
    expect(cancelled.fuelSearchSuppressed).toBe(true)
  })
})

describe('resolveTowTruck', () => {
  it('no hace nada si el vehículo no está varado', () => {
    const trip = makeBaseTrip()
    const resolved = resolveTowTruck(trip, 1000, 100, 100, STATIONS, 1000)
    expect(resolved).toBe(trip)
  })

  it('llena el tanque al toque y retoma viaje desde donde se quedó varado', () => {
    // Sin ninguna gasolinera cerca (país vacío de estaciones): con poco
    // combustible, se queda varado antes de llegar.
    const trip = makeBaseTrip({ startingFuelLiters: 5, fuelConsumptionPer100Km: 10, fuelStops: [] })
    const autonomyKm = 50 // 5L / 10L*100km
    const strandedAt = ((autonomyKm / trip.averageSpeedKmh) * 3_600_000) + 1000
    const strandedState = computeTripState(trip, strandedAt)
    expect(strandedState.status).toBe('stranded')

    const resolved = resolveTowTruck(trip, strandedAt, 100, 100, [], 1000)
    const afterState = computeTripState(resolved, strandedAt)
    expect(afterState.status).toBe('in_transit')
    expect(afterState.fuelLiters).toBeCloseTo(100, 5)
    expect(afterState.distanceTravelledKm).toBeCloseTo(strandedState.distanceTravelledKm, 3)
  })

  it('apaga fuelSearchSuppressed — la grúa es un replanteo completo, arranca de cero', () => {
    const trip = makeBaseTrip({ startingFuelLiters: 5, fuelConsumptionPer100Km: 10, fuelStops: [], fuelSearchSuppressed: true })
    const strandedAt = ((50 / trip.averageSpeedKmh) * 3_600_000) + 1000
    const resolved = resolveTowTruck(trip, strandedAt, 100, 100, [], 1000)
    expect(resolved.fuelSearchSuppressed).toBe(false)
  })
})
