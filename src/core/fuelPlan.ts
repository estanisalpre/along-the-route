import { autonomyKm, effectiveConsumptionPer100Km, fuelForDistanceKm, LOW_FUEL_LITERS, REFUEL_STOP_DURATION_MS } from './fuel'
import { haversineDistanceKm, type LonLat } from './geo'
import type { GasStation } from './gasStation'
import { positionAtDistance, type RouteData } from './route'
import { computeTripState, type FuelStop, type Trip } from './trip'

const MAX_STOPS_PER_TRIP = 6

/** La gasolinera geográficamente más cercana a `position`, sin importar si está de paso
 *  en el camino o no — "esté o no esté en su camino, así tenga que desviarse" es la regla
 *  (ver `planFuelStops`): siempre se prioriza la más cercana de VERDAD sobre una más lejana
 *  que casualmente esté sobre la ruta. */
export function findNearestGasStation(position: LonLat, stations: GasStation[]): GasStation | undefined {
  let best: GasStation | undefined
  let bestDistanceKm = Infinity
  for (const station of stations) {
    const distanceKm = haversineDistanceKm(position, [station.lon, station.lat])
    if (distanceKm < bestDistanceKm) {
      bestDistanceKm = distanceKm
      best = station
    }
  }
  return best
}

type PlannedStop = Omit<FuelStop, 'arrivalTimestamp' | 'departureTimestamp' | 'paid' | 'detourRouteGeometry'>

/**
 * Arma la lista de paradas de combustible necesarias para completar la ruta:
 * si el tanque no alcanza para llegar, va a la gasolinera geográficamente
 * MÁS CERCANA a la posición actual — esté o no de paso en el camino, así
 * tenga que desviarse — repostea hasta `refuelTargetLiters` y repite desde
 * ahí (siempre volviendo al mismo punto de la ruta original antes de seguir,
 * ver `computeTripState`).
 *
 * Esta es la implementación de "el chofer va solo a la gasolinera más
 * cercana antes de quedarse sin combustible" — se decide TODA de una vez, al
 * aceptar el viaje, en vez de perseguir al vehículo en vivo turno a turno. Es
 * lo mismo que describe docs/MECHANICS.md §2: "el sistema fuerza una parada
 * de carga, sin drama" — el viaje ya sale con las paradas necesarias
 * agendadas.
 *
 * Si ni la gasolinera más cercana está dentro del rango que alcanza el
 * tanque, se deja de agendar más paradas — es el riesgo que asume el
 * jugador si deja `refuelTargetLiters` demasiado bajo (ver
 * docs/FUEL_MECHANICS.md).
 */
export function planFuelStops(
  route: RouteData,
  startingFuelLiters: number,
  consumptionPer100Km: number,
  tankCapacityLiters: number,
  refuelTargetLiters: number,
  stations: GasStation[],
  currentStationPrice: number,
  /** Desde dónde arranca a planificar — 0 al aceptar el viaje, o la distancia ya
   *  recorrida cuando se replanifica en vivo (ver `replanTripFuel`). */
  fromDistanceKm = 0,
): PlannedStop[] {
  const cappedTarget = Math.min(refuelTargetLiters, tankCapacityLiters)
  const stops: PlannedStop[] = []

  let fuelLiters = startingFuelLiters
  let positionKm = fromDistanceKm

  while (stops.length < MAX_STOPS_PER_TRIP) {
    const autonomy = autonomyKm(fuelLiters, consumptionPer100Km)
    if (positionKm + autonomy >= route.distanceTotalKm) break // llega sin problema

    const leavePoint = positionAtDistance(route, Math.min(positionKm, route.distanceTotalKm)).position
    const nearest = findNearestGasStation(leavePoint, stations)
    if (!nearest) break // no hay ninguna gasolinera cargada (caso degenerado, país sin datos)

    const detourOneWayKm = haversineDistanceKm(leavePoint, [nearest.lon, nearest.lat])
    if (detourOneWayKm > autonomy) break // ni la más cercana es alcanzable — se asume el riesgo

    const fuelAtStation = fuelLiters - fuelForDistanceKm(detourOneWayKm, consumptionPer100Km)
    const litersAdded = Math.max(0, cappedTarget - fuelAtStation)
    if (litersAdded <= 0) break // el objetivo de recarga no alcanza para avanzar — evita loop infinito

    stops.push({
      gasStationId: nearest.id,
      atDistanceKm: positionKm,
      stationLat: nearest.lat,
      stationLon: nearest.lon,
      detourOneWayKm,
      litersAdded,
      cost: Math.round(litersAdded * currentStationPrice),
    })

    // La vuelta consume combustible igual que la ida — el tanque con el que se
    // sigue viaje es el que queda DESPUÉS de manejar de vuelta hasta la ruta,
    // no el que salió lleno de la gasolinera.
    fuelLiters = fuelAtStation + litersAdded - fuelForDistanceKm(detourOneWayKm, consumptionPer100Km)
    positionKm = Math.min(positionKm + autonomyKm(fuelLiters, consumptionPer100Km), route.distanceTotalKm)
  }

  return stops
}

/** Convierte las paradas (en distancia) en paradas con horarios reales. Cada parada suma,
 *  dentro de su propia ventana: el desvío de ida hasta la gasolinera, los 5 minutos fijos
 *  de carga, y el desvío de vuelta hasta el mismo punto de la ruta original (ver
 *  `computeTripState` en trip.ts, que anima las tres fases). */
export function scheduleFuelStops(
  stopsByDistance: PlannedStop[],
  departureTimestamp: number,
  averageSpeedKmh: number,
  fromDistanceKm = 0,
): { fuelStops: FuelStop[]; drivingAndStopsEndTimestamp: number } {
  let cursorTimestamp = departureTimestamp
  let cursorDistanceKm = fromDistanceKm

  const fuelStops: FuelStop[] = stopsByDistance.map((stop) => {
    // `arrivalTimestamp` marca cuando llega a `atDistanceKm` (todavía sobre la ruta
    // original) y ahí arranca el episodio completo de la parada — el propio desvío
    // de ida queda DENTRO de `[arrivalTimestamp, departureTimestamp)`, lo anima
    // `computeTripState` (ver core/trip.ts `fuelStopState`).
    const drivingToLeavePointMs = (Math.abs(stop.atDistanceKm - cursorDistanceKm) / averageSpeedKmh) * 3_600_000
    const detourLegMs = (stop.detourOneWayKm / averageSpeedKmh) * 3_600_000
    const arrivalTimestamp = cursorTimestamp + drivingToLeavePointMs
    const departureTimestampAtStop = arrivalTimestamp + detourLegMs + REFUEL_STOP_DURATION_MS + detourLegMs
    cursorTimestamp = departureTimestampAtStop
    cursorDistanceKm = stop.atDistanceKm
    return { ...stop, arrivalTimestamp, departureTimestamp: departureTimestampAtStop, paid: false }
  })

  return { fuelStops, drivingAndStopsEndTimestamp: cursorTimestamp }
}

/**
 * El núcleo común a `replanTripFuel` y `adjustTripFuel`: dado un punto de
 * partida (distancia y combustible) distinto al origen de la ruta, arma un
 * plan de paradas nuevo desde ahí hasta destino y devuelve el viaje
 * "re-anclado" a `now`. Las paradas viejas que ya habían pasado (con `paid:
 * true`) no se pierden: su costo se suma a `totalFuelCostPaid` (que
 * sobrevive a cualquier cantidad de replanteos) antes de reemplazar la
 * lista — así el resumen final del viaje sigue sumando bien aunque el
 * jugador haya cambiado de idea varias veces a mitad de camino.
 *
 * También apaga `fuelSearchSuppressed` (ver `cancelFuelStop`): es una acción
 * explícita del jugador sobre el combustible o el plan del viaje, así que
 * vuelve a habilitar la vigilancia pasiva de combustible bajo (§4.3).
 */
function rebaseTripFrom(
  trip: Trip,
  now: number,
  fuelLiters: number,
  distanceTravelledKm: number,
  cruiseSpeedKmh: number,
  consumptionPer100Km: number,
  refuelTargetLiters: number,
  tankCapacityLiters: number,
  stations: GasStation[],
  currentStationPrice: number,
): Trip {
  const paidSoFar = trip.fuelStops.filter((s) => s.paid).reduce((sum, s) => sum + s.cost, 0)

  const stopsByDistance = planFuelStops(
    trip.route,
    fuelLiters,
    consumptionPer100Km,
    tankCapacityLiters,
    refuelTargetLiters,
    stations,
    currentStationPrice,
    distanceTravelledKm,
  )
  const { fuelStops, drivingAndStopsEndTimestamp } = scheduleFuelStops(
    stopsByDistance,
    now,
    cruiseSpeedKmh,
    distanceTravelledKm,
  )

  const lastStopDistanceKm = fuelStops.at(-1)?.atDistanceKm ?? distanceTravelledKm
  const remainingHours = (trip.route.distanceTotalKm - lastStopDistanceKm) / cruiseSpeedKmh

  return {
    ...trip,
    departureTimestamp: now,
    startingDistanceKm: distanceTravelledKm,
    startingFuelLiters: fuelLiters,
    averageSpeedKmh: cruiseSpeedKmh,
    fuelConsumptionPer100Km: consumptionPer100Km,
    fuelStops,
    estimatedArrivalTimestamp: drivingAndStopsEndTimestamp + remainingHours * 3_600_000,
    totalFuelCostPaid: trip.totalFuelCostPaid + paidSoFar,
    fuelSearchSuppressed: false,
  }
}

/**
 * Re-planifica un viaje EN CURSO cuando el jugador cambia la velocidad de
 * crucero o el objetivo de recarga en vivo (ver VehicleDetailPanel.tsx): toma
 * una foto del estado actual (distancia recorrida, combustible, hora) y
 * arma un plan nuevo desde ahí hasta destino, con los valores nuevos — como
 * si fuera un viaje nuevo que arranca en ese punto exacto de la ruta, no
 * desde el origen.
 *
 * Si el vehículo está parado repostando en este mismo instante (`status ===
 * 'refueling'`), no tiene sentido replanificar ahí mismo — se deja que
 * termine esa parada tal cual estaba, y el cambio se aplica recién en el
 * próximo replanteo (o al aceptar el próximo viaje).
 */
export function replanTripFuel(
  trip: Trip,
  now: number,
  newCruiseSpeedKmh: number,
  newRefuelTargetLiters: number,
  tankCapacityLiters: number,
  baseConsumptionPer100Km: number,
  ratedSpeedKmh: number,
  stations: GasStation[],
  currentStationPrice: number,
): Trip {
  const state = computeTripState(trip, now)
  if (state.status !== 'in_transit') return trip

  const newConsumption = effectiveConsumptionPer100Km(baseConsumptionPer100Km, newCruiseSpeedKmh, ratedSpeedKmh)
  return rebaseTripFrom(
    trip,
    now,
    state.fuelLiters,
    state.distanceTravelledKm,
    newCruiseSpeedKmh,
    newConsumption,
    newRefuelTargetLiters,
    tankCapacityLiters,
    stations,
    currentStationPrice,
  )
}

/**
 * Suma o resta combustible a un viaje EN CURSO — pensado para el botoncito
 * de "▲/▼ combustible" del panel de debug (ver VehicleDetailPanel.tsx), que
 * permite forzar un vehículo a quedarse bajo de combustible sin tener que
 * esperar a que lo consuma solo, para poder probar la mecánica de
 * gasolineras. Se clampea a `[0, tankCapacityLiters]` y reusa la misma
 * velocidad/objetivo de recarga que ya tenía el viaje — solo cambia el
 * combustible.
 *
 * **Solo busca una gasolinera si el nuevo nivel queda en `LOW_FUEL_LITERS` o
 * menos** — igual que la vigilancia de §4.3. Si se queda por encima (por
 * ejemplo, bajarlo de 30L a 29L en un viaje largo para el tanque), NO corre
 * `planFuelStops`: `planFuelStops` agenda una parada en cuanto la autonomía
 * no alcanza para TERMINAR el viaje completo — un umbral mucho más exigente
 * que "estar bajo de combustible" — así que, sin este chequeo, CUALQUIER
 * click de ▼ (o incluso de ▲) terminaba agendando una parada de la nada con
 * el tanque todavía cómodo, apenas el viaje era un poco largo para el
 * tanque. En ese caso simplemente se re-ancla el viaje al presente con el
 * nuevo número (mismo patrón que `cancelFuelStop`, §4.2: `fuelStops: []`,
 * nada que buscar todavía) y, como es una acción explícita del jugador,
 * también apaga `fuelSearchSuppressed` si había quedado prendido por una
 * cancelación previa.
 *
 * Igual que `replanTripFuel`: si el vehículo ya está en medio de una parada
 * (`status === 'refueling'`, cualquiera de sus fases), no hace nada — cada
 * click de ▲/▼ reemplazaría la parada activa por una recién agendada EN EL
 * MISMO LUGAR (la posición está congelada durante la parada, así que "la
 * más cercana" siempre vuelve a ser la misma gasolinera), reiniciando el
 * ciclo ida→carga→vuelta una y otra vez sin dejarlo terminar nunca — un bug
 * real que pasaba antes de este chequeo. Además, ya existe un botón
 * dedicado para intervenir una parada en curso (`cancelFuelStop`, §4.2).
 * Solo no hace nada tampoco si el viaje ya llegó a destino.
 */
export function adjustTripFuel(
  trip: Trip,
  now: number,
  deltaLiters: number,
  tankCapacityLiters: number,
  refuelTargetLiters: number,
  stations: GasStation[],
  currentStationPrice: number,
): Trip {
  const state = computeTripState(trip, now)
  if (state.status !== 'in_transit' && state.status !== 'stranded') return trip

  const newFuelLiters = Math.max(0, Math.min(tankCapacityLiters, state.fuelLiters + deltaLiters))

  if (newFuelLiters > LOW_FUEL_LITERS) {
    const paidSoFar = trip.fuelStops.filter((s) => s.paid).reduce((sum, s) => sum + s.cost, 0)
    const remainingHours = (trip.route.distanceTotalKm - state.distanceTravelledKm) / trip.averageSpeedKmh
    return {
      ...trip,
      departureTimestamp: now,
      startingDistanceKm: state.distanceTravelledKm,
      startingFuelLiters: newFuelLiters,
      fuelStops: [],
      estimatedArrivalTimestamp: now + remainingHours * 3_600_000,
      totalFuelCostPaid: trip.totalFuelCostPaid + paidSoFar,
      fuelSearchSuppressed: false,
    }
  }

  return rebaseTripFrom(
    trip,
    now,
    newFuelLiters,
    state.distanceTravelledKm,
    trip.averageSpeedKmh,
    trip.fuelConsumptionPer100Km,
    refuelTargetLiters,
    tankCapacityLiters,
    stations,
    currentStationPrice,
  )
}

/** Si la posición al cancelar ya está a esta distancia (o menos) del punto de la ruta,
 *  se considera "ya está sobre la ruta" — ni vale la pena animar un tramo de vuelta,
 *  directamente retoma viaje ahí mismo sin más (ver `cancelFuelStop`). */
const ALREADY_ON_ROUTE_KM = 0.1

/**
 * Cancela la parada de combustible activa — pero SOLO mientras todavía NO
 * empezó a cargar de verdad (`refuelPhase === 'waiting_for_route'`, esperando
 * la respuesta del servicio de ruteo, o `'to_station'`, ya manejando hacia la
 * gasolinera). Una vez que ya está cargando (`'pumping'`), no se puede
 * cancelar más — hay que esperar a que termine sí o sí, como una parada
 * real; solo ahí arranca el tramo de vuelta (`'returning'`, ya sin necesidad
 * de cancelar nada). El vehículo NO se teletransporta de vuelta a la ruta al
 * cancelar — arma un `ReturnToRouteLeg` (ver core/trip.ts) que lo anima
 * manejando en línea recta desde su posición ACTUAL (donde sea que haya
 * cancelado) hasta `atDistanceKm` (el punto de la ruta original), con el
 * combustible que tenga en ESE momento. Si esa distancia es insignificante
 * (`ALREADY_ON_ROUTE_KM` o menos — típicamente canceló apenas arrancó el
 * desvío de ida), directamente NO arma ningún tramo: ya está sobre la ruta,
 * sigue su rumbo de una, sin línea verde ni nada que animar.
 *
 * **Cancelar significa "olvidate de esta gasolinera": queda `fuelStops: []`,
 * sin agendar ninguna parada nueva** — el único objetivo pasa a ser retomar
 * la ruta principal y seguir viaje, asumiendo el riesgo de quedarse sin
 * combustible más adelante (§7 de docs/FUEL_MECHANICS.md; si de verdad pasa,
 * termina `'stranded'`, resuelto con la grúa — §4.4). A propósito NO se
 * vuelve a correr `planFuelStops` acá: ese algoritmo agenda una parada en
 * cuanto la autonomía no alcanza para TERMINAR el viaje completo — un umbral
 * mucho más exigente que "quedarse sin combustible ya" — así que, salvo que
 * el tanque haya quedado prácticamente lleno, siempre iba a encontrar
 * "necesito otra parada" apenas terminaba el tramo de vuelta, reagendando la
 * MISMA gasolinera (o una casi idéntica) una y otra vez: un loop infinito de
 * cancelar→volver→volver a necesitarla que era, literalmente, un bug.
 *
 * Por la misma razón, tampoco alcanza con no llamar a `planFuelStops` ACÁ: la
 * vigilancia de combustible bajo (§4.3) corre sola en cada tick, y sin nada
 * que la frene volvía a encontrar la gasolinera recién cancelada un instante
 * después (mismo tanque bajo, `fuelStops: []`) — mismo loop, un paso más
 * atrás. Por eso esta función también prende `trip.fuelSearchSuppressed`:
 * mientras esté prendido, §4.3 no vuelve a buscar sola, aunque el tanque siga
 * bajo — el jugador asume el riesgo de quedarse sin combustible (y terminar
 * `'stranded'`, §4.4) hasta que haga algo explícito (tocar el combustible o
 * el plan del viaje), que es lo único que lo vuelve a apagar.
 *
 * Si ya se había pagado esta parada (el cobro corre solo, ver Dashboard.tsx),
 * ese gasto no se pierde de la cuenta: se suma a `totalFuelCostPaid` igual
 * que en cualquier otro replanteo — aunque el vehículo se haya ido antes de
 * terminar de cargar todo lo que esa plata pagaba.
 *
 * No hace nada si no hay ninguna parada activa, o si ya está cargando o
 * volviendo (`refuelPhase !== 'waiting_for_route' && refuelPhase !== 'to_station'`).
 */
export function cancelFuelStop(trip: Trip, now: number): Trip {
  const state = computeTripState(trip, now)
  if (
    state.status !== 'refueling' ||
    !state.activeFuelStop ||
    (state.refuelPhase !== 'to_station' && state.refuelPhase !== 'waiting_for_route')
  ) {
    return trip
  }

  const stop = state.activeFuelStop
  const paidSoFar = trip.fuelStops.filter((s) => s.paid).reduce((sum, s) => sum + s.cost, 0)
  const routePoint = positionAtDistance(trip.route, stop.atDistanceKm).position
  const oneWayKm = haversineDistanceKm(state.position, routePoint)
  const alreadyOnRoute = oneWayKm <= ALREADY_ON_ROUTE_KM
  const legMs = alreadyOnRoute ? 0 : (oneWayKm / trip.averageSpeedKmh) * 3_600_000
  const remainingHours = (trip.route.distanceTotalKm - stop.atDistanceKm) / trip.averageSpeedKmh

  return {
    ...trip,
    departureTimestamp: now,
    startingDistanceKm: stop.atDistanceKm,
    startingFuelLiters: state.fuelLiters,
    returnToRouteLeg: alreadyOnRoute ? undefined : { fromPosition: state.position, atDistanceKm: stop.atDistanceKm, oneWayKm, startedAt: now },
    fuelStops: [],
    estimatedArrivalTimestamp: now + legMs + remainingHours * 3_600_000,
    totalFuelCostPaid: trip.totalFuelCostPaid + paidSoFar,
    fuelSearchSuppressed: true,
  }
}

/**
 * Resuelve un vehículo varado (`status: 'stranded'`, ver core/trip.ts): llena
 * el tanque al toque — sin tiempo de espera, la grúa "ya vino y lo asistió" —
 * y replanifica el resto del viaje desde ahí mismo, igual que cualquier otro
 * replanteo (así, si hiciera falta OTRA parada más adelante, ya queda
 * agendada de una, no vuelve a quedar a la deriva). El costo fijo de la
 * asistencia (`TOW_TRUCK_COST`, core/fuel.ts) es plata de la empresa, no de
 * este viaje — lo descuenta `Dashboard.tsx` de la caja, esta función solo se
 * ocupa de la mecánica del viaje en sí.
 *
 * No hace nada si el vehículo no está realmente varado.
 */
export function resolveTowTruck(
  trip: Trip,
  now: number,
  tankCapacityLiters: number,
  refuelTargetLiters: number,
  stations: GasStation[],
  currentStationPrice: number,
): Trip {
  const state = computeTripState(trip, now)
  if (state.status !== 'stranded') return trip

  return rebaseTripFrom(
    trip,
    now,
    tankCapacityLiters,
    state.distanceTravelledKm,
    trip.averageSpeedKmh,
    trip.fuelConsumptionPer100Km,
    refuelTargetLiters,
    tankCapacityLiters,
    stations,
    currentStationPrice,
  )
}
