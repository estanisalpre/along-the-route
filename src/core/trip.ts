import { autonomyKm, fuelForDistanceKm, REFUEL_STOP_DURATION_MS } from './fuel'
import type { LonLat } from './geo'
import { buildRouteData, positionAtDistance, type RouteData } from './route'

export interface FuelStop {
  gasStationId: string
  /** Distancia acumulada (km) de la ruta ORIGINAL en la que el vehículo se desvía para ir a
   *  repostar — y a la que vuelve después (el desvío es ida y vuelta al mismo punto, no
   *  reemplaza ni recorta la ruta original). */
  atDistanceKm: number
  /** Coordenadas reales de la gasolinera (puede estar lejos de la ruta — se elige siempre la
   *  más cercana a la posición actual, esté o no de paso, ver `planFuelStops`). */
  stationLat: number
  stationLon: number
  /** Distancia (km) de IDA desde el punto de la ruta hasta la gasolinera — en línea recta
   *  hasta que el servicio de ruteo (OSRM) resuelve la geometría real (`detourRouteGeometry`).
   *  Define el tiempo/combustible que cuesta el desvío (ida + vuelta), independientemente de
   *  si ya se conoce la geometría real o no (ver Dashboard.tsx `resolveDetourRoutes`). */
  detourOneWayKm: number
  /** Geometría real (por calles) del tramo de IDA a la gasolinera, resuelta vía el mismo
   *  servicio de ruteo que la ruta principal — puramente visual (posición del vehículo
   *  mientras dura el desvío y la línea verde del mapa). Si el pedido falló (y por eso quedó
   *  sin geometría) se anima con una línea recta en su lugar. La vuelta reusa esta misma
   *  geometría invertida (se asume el mismo camino de regreso). */
  detourRouteGeometry?: LonLat[]
  /** Momento en que se resolvió el pedido al servicio de ruteo para el desvío de ida — ya sea
   *  con éxito (`detourRouteGeometry` seteada) o con el fallback de línea recta si falló (ver
   *  Dashboard.tsx `resolveDetourRoutes`). Mientras esto sea `undefined`, el vehículo se queda
   *  ESPERANDO en `atDistanceKm` sin arrancar a manejar — no tiene sentido animarlo por una
   *  línea recta que puede no seguir ningún camino real hasta no tener, al menos, una
   *  respuesta (buena o mala) del servicio de ruteo. */
  detourResolvedAt?: number
  litersAdded: number
  /** Precio de la gasolinera al momento de aceptar el viaje (ver docs/FUEL_MECHANICS.md — no se
   *  recalcula con el precio real del momento en que el vehículo llega). */
  cost: number
  /** Momento en que el vehículo llega al punto `atDistanceKm` de la ruta original y arranca
   *  todo el "episodio" de la parada (desvío de ida, carga, desvío de vuelta — ver
   *  `computeTripState`). */
  arrivalTimestamp: number
  /** Momento en que el vehículo ya volvió a `atDistanceKm` y sigue viaje normal — incluye
   *  el desvío de ida, los 5 minutos fijos de carga y el desvío de vuelta. */
  departureTimestamp: number
  /** Si ya se descontó de la caja de la empresa (lo marca el tick de Dashboard.tsx, una sola vez). */
  paid: boolean
}

/**
 * El tramo de "recuperación" que arma `cancelFuelStop` (core/fuelPlan.ts) al
 * cancelar una parada a mitad de camino: en vez de teletransportar al
 * vehículo de vuelta a `atDistanceKm`, lo anima manejando en línea recta desde
 * `fromPosition` (dónde estaba exactamente al cancelar) hasta ese punto de la
 * ruta. Es de un solo uso: una vez que `computeTripState` pasa este tramo, el
 * viaje sigue el flujo normal desde `atDistanceKm` y este campo queda
 * simplemente sin efecto (no hace falta borrarlo).
 *
 * A propósito NO se le pide una ruta real al servicio de ruteo para este
 * tramo (a diferencia del desvío normal a una gasolinera, ver `FuelStop`):
 * `fromPosition` es un punto interpolado a mitad de un desvío anterior, casi
 * siempre fuera de cualquier calle real — pedirle a OSRM una ruta desde ahí
 * puede devolver un camino mucho más largo que la línea recta (el auto más
 * cercano puede estar lejos), y como el tiempo de este tramo ya se fija con
 * la distancia recta al cancelar, el vehículo terminaría teniendo que
 * recorrer ese camino más largo en el mismo tiempo corto — se ve "yendo
 * rapidísimo". La línea recta evita ese descalce de raíz.
 */
export interface ReturnToRouteLeg {
  fromPosition: LonLat
  /** El mismo punto de la ruta original al que apuntaba la parada cancelada. */
  atDistanceKm: number
  /** Distancia (km) de este tramo, siempre en línea recta. */
  oneWayKm: number
  startedAt: number
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
  /** Consumo efectivo (L/100km) a la velocidad de crucero elegida — fijo desde `departureTimestamp`
   *  hasta el próximo replanteo (ver core/fuelPlan.ts `replanTripFuel`). */
  fuelConsumptionPer100Km: number
  /** Paradas a repostar agendadas desde `departureTimestamp` (puede ser []), ordenadas por distancia. */
  fuelStops: FuelStop[]
  /** Distancia (km) ya recorrida cuando arrancó el régimen actual de velocidad/consumo — 0 al
   *  aceptar el viaje. Si el jugador cambia la velocidad de crucero o el objetivo de recarga
   *  mientras el vehículo ya está en ruta, esto avanza junto con `departureTimestamp` (ver
   *  `replanTripFuel`) — es lo que le permite a `computeTripState` seguir siendo una función pura
   *  de `(trip, now)` aunque el viaje haya cambiado de plan a mitad de camino. */
  startingDistanceKm: number
  /** Plata ya gastada en combustible en regímenes ANTERIORES al actual (paradas que ya pasaron
   *  antes del último replanteo) — sobrevive a cualquier cantidad de replanteos. El costo total
   *  real del viaje es esto más lo que sume `fuelStops` del régimen actual. */
  totalFuelCostPaid: number
  /** Si el jugador canceló una parada de combustible a mitad de camino, ver `cancelFuelStop`
   *  en core/fuelPlan.ts — de un solo uso, `computeTripState` lo consume y sigue normal. */
  returnToRouteLeg?: ReturnToRouteLeg
  /** Se pone en `true` cuando el jugador cancela una parada de combustible (`cancelFuelStop`,
   *  core/fuelPlan.ts) — mientras esté en `true`, la vigilancia pasiva de combustible bajo
   *  (§4.3 de docs/FUEL_MECHANICS.md) NO vuelve a buscar gasolinera sola, aunque el tanque
   *  siga por debajo de `LOW_FUEL_LITERS`: el jugador ya dijo que no quiere parar, y sin este
   *  freno la vigilancia encontraba la misma gasolinera un instante después de cancelar,
   *  reiniciando el ciclo ida→cancelar→ida en loop. Se limpia (vuelve a `false`) con cualquier
   *  acción explícita del jugador que toque el combustible o el plan del viaje — el botón
   *  ▲/▼ de debug, los sliders de velocidad/objetivo de recarga, o la grúa — todas pasan por
   *  `rebaseTripFrom` o el branch alto de `adjustTripFuel`, que lo resetean. */
  fuelSearchSuppressed?: boolean
}

export function estimateArrivalTimestamp(departureTimestamp: number, distanceTotalKm: number, averageSpeedKmh: number): number {
  return departureTimestamp + (distanceTotalKm / averageSpeedKmh) * 3_600_000
}

export interface TripState {
  /** `'stranded'`: se quedó sin combustible de verdad (no había ninguna gasolinera
   *  alcanzable) — el vehículo queda congelado ahí, no avanza más, hasta que el
   *  jugador llame a la grúa (ver `resolveTowTruck` en core/fuelPlan.ts). */
  status: 'in_transit' | 'refueling' | 'arrived' | 'stranded'
  distanceTravelledKm: number
  /** 0-1 */
  progress: number
  position: LonLat
  bearing: number
  remainingKm: number
  /** Combustible actual (litros) — baja mientras viaja, sube en vivo durante una parada. */
  fuelLiters: number
  /** Solo si `status === 'refueling'`: en qué parte del episodio está — esperando que
   *  resuelva la ruta real, yendo hacia la gasolinera, ya cargando ahí, o volviendo hacia
   *  la ruta (ver `fuelStopState`). El texto/UI debe variar según esto: "Repostando" solo
   *  aplica a `'pumping'`. */
  refuelPhase?: 'waiting_for_route' | 'to_station' | 'pumping' | 'returning'
  /** Solo si `status === 'refueling'`: 0-1, progreso de la CARGA en sí (no del episodio
   *  completo) — 0 mientras todavía viaja hacia la gasolinera, sube de 0 a 1 mientras
   *  carga, se mantiene en 1 mientras vuelve (ya cargó del todo). */
  refuelProgress?: number
  /** Solo si `status === 'refueling'`: litros ya cargados en este momento (0 hasta que
   *  empieza a cargar, sube en vivo durante `'pumping'`, queda en `stop.litersAdded`
   *  durante `'returning'`) — para mostrar el número en vivo, no solo el porcentaje. */
  litersAddedSoFar?: number
  /** Solo si `status === 'refueling'`: la parada activa. */
  activeFuelStop?: FuelStop
  /** Mientras viaja hacia la PRÓXIMA parada agendada (todavía no llegó) — hacia adelante
   *  o, si la gasolinera alcanzable más cercana quedó atrás, hacia atrás (ver
   *  `planFuelStops`). Deja ver el desvío verde en el mapa desde el momento en que se
   *  agenda la parada, no recién cuando ya llegó (ver DashboardMap.tsx `applyFuelDetourLine`). */
  upcomingFuelStop?: FuelStop
}

/**
 * Posición/bearing a una fracción `t` (0-1) de un camino cualquiera — se
 * arma un `RouteData` de usar y tirar a partir del path (la geometría real
 * del desvío si ya la resolvió el servicio de ruteo, o una línea recta de 2
 * puntos mientras tanto) y se interpola con la misma función que usa toda
 * ruta del juego. `path` siempre tiene al menos 2 puntos.
 */
function positionAlongPath(path: LonLat[], t: number): { position: LonLat; bearing: number } {
  const routeData = buildRouteData('desvío', 'desvío', path)
  return positionAtDistance(routeData, Math.min(Math.max(t, 0), 1) * routeData.distanceTotalKm)
}

/**
 * Anima el tramo de "recuperación" tras cancelar una parada (ver
 * `ReturnToRouteLeg`): maneja desde `fromPosition` hasta `atDistanceKm` de la
 * ruta original, en `oneWayKm / averageSpeedKmh` horas. Devuelve `undefined`
 * si el tramo ya terminó (`computeTripState` sigue el flujo normal desde ahí).
 *
 * Reusa el campo `activeFuelStop` (con un `FuelStop` sintético, sin costo ni
 * litros reales) para que el resto de la UI y el desvío verde del mapa
 * funcionen sin ningún caso especial — a los ojos de `VehicleDetailPanel.tsx`
 * y `DashboardMap.tsx` esto es indistinguible de "volviendo de una parada".
 */
function returnToRouteLegState(trip: Trip, fuelAtCancel: number, leg: ReturnToRouteLeg, now: number): TripState | undefined {
  const legMs = (leg.oneWayKm / trip.averageSpeedKmh) * 3_600_000
  const endTimestamp = leg.startedAt + legMs
  if (now >= endTimestamp) return undefined

  const t = legMs > 0 ? (now - leg.startedAt) / legMs : 1
  const routePoint = positionAtDistance(trip.route, leg.atDistanceKm)
  const { position, bearing } = positionAlongPath([leg.fromPosition, routePoint.position], t)
  const fuelLiters = Math.max(0, fuelAtCancel - fuelForDistanceKm(leg.oneWayKm * Math.min(1, t), trip.fuelConsumptionPer100Km))

  const syntheticStop: FuelStop = {
    gasStationId: 'volviendo-a-la-ruta',
    atDistanceKm: leg.atDistanceKm,
    stationLat: routePoint.position[1],
    stationLon: routePoint.position[0],
    detourOneWayKm: leg.oneWayKm,
    litersAdded: 0,
    cost: 0,
    arrivalTimestamp: leg.startedAt,
    departureTimestamp: endTimestamp,
    paid: true,
  }

  return {
    status: 'refueling',
    distanceTravelledKm: leg.atDistanceKm,
    progress: leg.atDistanceKm / trip.route.distanceTotalKm,
    position,
    bearing,
    remainingKm: trip.route.distanceTotalKm - leg.atDistanceKm,
    fuelLiters,
    refuelPhase: 'returning',
    refuelProgress: 1,
    litersAddedSoFar: 0,
    activeFuelStop: syntheticStop,
  }
}

/**
 * Mientras el vehículo ya llegó al punto de la ruta donde tiene que desviarse
 * pero el servicio de ruteo TODAVÍA no contestó (`stop.detourResolvedAt`
 * sigue `undefined`): se queda quieto ahí, sin arrancar a manejar por una
 * línea que a lo mejor ni sigue un camino real — nada de combustible se gasta
 * mientras espera. En cuanto `Dashboard.tsx` recibe una respuesta (buena o
 * mala, ver `resolveDetourRoutes`) esto deja de pasar y arranca el desvío de
 * verdad (`fuelStopState`).
 */
function waitingForRouteState(trip: Trip, stop: FuelStop, fuelAtLeavePoint: number): TripState {
  const routePoint = positionAtDistance(trip.route, stop.atDistanceKm)
  return {
    status: 'refueling',
    distanceTravelledKm: stop.atDistanceKm,
    progress: stop.atDistanceKm / trip.route.distanceTotalKm,
    position: routePoint.position,
    bearing: routePoint.bearing,
    remainingKm: trip.route.distanceTotalKm - stop.atDistanceKm,
    fuelLiters: Math.max(0, fuelAtLeavePoint),
    refuelPhase: 'waiting_for_route',
    refuelProgress: 0,
    litersAddedSoFar: 0,
    activeFuelStop: stop,
  }
}

/**
 * Todo lo que hace falta para animar el "episodio" de una parada de
 * combustible en un instante dado, YA con el desvío resuelto (`detourResolvedAt`
 * seteado, ver `waitingForRouteState`): desvío de ida (deja la ruta original),
 * carga fija de 5 minutos parado en la gasolinera, y desvío de vuelta (vuelve
 * al mismo punto de la ruta original). Las tres fases se cuentan a partir de
 * `detourResolvedAt` — no de `stop.arrivalTimestamp` — porque recién ahí se
 * supo cuánto dura de verdad el desvío (`stop.detourOneWayKm`, ya sea la
 * distancia real por calle o la línea recta de fallback).
 */
function fuelStopState(trip: Trip, stop: FuelStop, fuelAtLeavePoint: number, now: number, outEndTimestamp: number, pumpEndTimestamp: number): TripState {
  const routePoint = positionAtDistance(trip.route, stop.atDistanceKm)
  const stationPoint: LonLat = [stop.stationLon, stop.stationLat]
  const detourPath = stop.detourRouteGeometry ?? [routePoint.position, stationPoint]
  const detourLegMs = (stop.detourOneWayKm / trip.averageSpeedKmh) * 3_600_000

  const base = {
    status: 'refueling' as const,
    distanceTravelledKm: stop.atDistanceKm,
    progress: stop.atDistanceKm / trip.route.distanceTotalKm,
    remainingKm: trip.route.distanceTotalKm - stop.atDistanceKm,
    activeFuelStop: stop,
  }

  if (now < outEndTimestamp) {
    // Manejando el desvío de IDA: todavía no llegó a la gasolinera, no arrancó a cargar.
    const t = detourLegMs > 0 ? (now - stop.detourResolvedAt!) / detourLegMs : 1
    const { position, bearing } = positionAlongPath(detourPath, t)
    const fuelLiters = Math.max(0, fuelAtLeavePoint - fuelForDistanceKm(stop.detourOneWayKm * Math.min(1, t), trip.fuelConsumptionPer100Km))
    return { ...base, position, bearing, fuelLiters, refuelPhase: 'to_station', refuelProgress: 0, litersAddedSoFar: 0 }
  }

  const fuelAtStation = fuelAtLeavePoint - fuelForDistanceKm(stop.detourOneWayKm, trip.fuelConsumptionPer100Km)

  if (now < pumpEndTimestamp) {
    // Parado de verdad en la gasolinera, cargando — acá SÍ suben los litros en vivo.
    const pumpDurationMs = pumpEndTimestamp - outEndTimestamp
    const pumpProgress = pumpDurationMs > 0 ? (now - outEndTimestamp) / pumpDurationMs : 1
    const litersAddedSoFar = stop.litersAdded * pumpProgress
    return {
      ...base,
      position: stationPoint,
      bearing: routePoint.bearing,
      fuelLiters: Math.max(0, fuelAtStation + litersAddedSoFar),
      refuelPhase: 'pumping',
      refuelProgress: pumpProgress,
      litersAddedSoFar,
    }
  }

  // Manejando el desvío de VUELTA: ya cargó del todo, vuelve al punto de la ruta original.
  const t = detourLegMs > 0 ? (now - pumpEndTimestamp) / detourLegMs : 1
  const { position, bearing } = positionAlongPath([...detourPath].reverse(), t)
  const fuelAfterRefuel = fuelAtStation + stop.litersAdded
  const fuelLiters = Math.max(0, fuelAfterRefuel - fuelForDistanceKm(stop.detourOneWayKm * Math.min(1, t), trip.fuelConsumptionPer100Km))
  return { ...base, position, bearing, fuelLiters, refuelPhase: 'returning', refuelProgress: 1, litersAddedSoFar: stop.litersAdded }
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
 * Arranca desde `startingDistanceKm` (no siempre 0): si el viaje se
 * replanificó en vivo (el jugador cambió velocidad/objetivo de recarga a
 * mitad de camino, ver `replanTripFuel` en core/fuelPlan.ts), ahí quedó
 * guardada la distancia que ya llevaba recorrida en ese momento.
 */
export function computeTripState(trip: Trip, now: number): TripState {
  let cursorTimestamp = trip.departureTimestamp
  let cursorDistanceKm = trip.startingDistanceKm
  let cursorFuelLiters = trip.startingFuelLiters

  if (trip.returnToRouteLeg) {
    const returning = returnToRouteLegState(trip, cursorFuelLiters, trip.returnToRouteLeg, now)
    if (returning) return returning
    // Ya terminó de volver a la ruta — sigue el flujo normal desde ahí, como cualquier otro tramo.
    const leg = trip.returnToRouteLeg
    const legMs = (leg.oneWayKm / trip.averageSpeedKmh) * 3_600_000
    cursorTimestamp = leg.startedAt + legMs
    cursorDistanceKm = leg.atDistanceKm
    cursorFuelLiters = Math.max(0, cursorFuelLiters - fuelForDistanceKm(leg.oneWayKm, trip.fuelConsumptionPer100Km))
  }

  for (const stop of trip.fuelStops) {
    // Todavía viajando hacia esta parada — puede ser hacia adelante o, si la
    // gasolinera alcanzable más cercana quedó atrás, hacia atrás (nunca se
    // descarta un candidato solo por estar detrás, ver `planFuelStops`).
    if (now < stop.arrivalTimestamp) {
      return drivingState(trip, cursorTimestamp, cursorDistanceKm, cursorFuelLiters, now, stop.atDistanceKm, stop)
    }

    const fuelAtLeavePoint =
      cursorFuelLiters - fuelForDistanceKm(Math.abs(stop.atDistanceKm - cursorDistanceKm), trip.fuelConsumptionPer100Km)

    // Ya llegó al punto de la ruta pero todavía no sabe el camino real hacia la
    // gasolinera — se queda esperando ahí (ver `waitingForRouteState`), no
    // arranca a manejar por una línea que a lo mejor ni sigue un camino real.
    if (!stop.detourResolvedAt) {
      return waitingForRouteState(trip, stop, fuelAtLeavePoint)
    }

    const detourLegMs = (stop.detourOneWayKm / trip.averageSpeedKmh) * 3_600_000
    const outEndTimestamp = stop.detourResolvedAt + detourLegMs
    const pumpEndTimestamp = outEndTimestamp + REFUEL_STOP_DURATION_MS
    const backEndTimestamp = pumpEndTimestamp + detourLegMs

    if (now < backEndTimestamp) {
      return fuelStopState(trip, stop, fuelAtLeavePoint, now, outEndTimestamp, pumpEndTimestamp)
    }

    // El episodio completo de la parada (ida + carga + vuelta) ya terminó — el
    // tanque nunca debería quedar en negativo (ej. si el jugador bajó
    // `refuelTargetLiters` después de agendada), se recorta en 0 en vez de
    // arrastrar un número sin sentido al resto del viaje.
    cursorTimestamp = backEndTimestamp
    cursorDistanceKm = stop.atDistanceKm
    cursorFuelLiters = Math.max(
      0,
      fuelAtLeavePoint -
        fuelForDistanceKm(stop.detourOneWayKm, trip.fuelConsumptionPer100Km) +
        stop.litersAdded -
        fuelForDistanceKm(stop.detourOneWayKm, trip.fuelConsumptionPer100Km),
    )
  }

  return drivingState(trip, cursorTimestamp, cursorDistanceKm, cursorFuelLiters, now, trip.route.distanceTotalKm)
}

/**
 * El tramo "manejando" común a dos casos: yendo hacia la próxima parada
 * agendada (`targetDistanceKm` = esa parada, puede quedar detrás de
 * `cursorDistanceKm` — ver arriba) o, ya sin más paradas, rumbo al destino
 * final (`targetDistanceKm` = `route.distanceTotalKm`, siempre hacia
 * adelante). En ambos casos la distancia recorrida avanza a
 * `averageSpeedKmh` desde `cursorTimestamp`, sin pasarse del objetivo —
 * salvo que el combustible se acabe antes: ahí se congela en seco (ver
 * `TripState.status: 'stranded'`) — el vehículo NO puede seguir moviéndose
 * sin combustible, hace falta llamar a la grúa (`resolveTowTruck` en
 * core/fuelPlan.ts) para que retome viaje. Esto en la práctica case casi
 * nunca pasa: `planFuelStops` (§4 de docs/FUEL_MECHANICS.md) siempre agenda
 * una parada ANTES de que la autonomía no alcance, así que solo se llega a
 * este congelamiento si de verdad no había ninguna gasolinera alcanzable en
 * todo el país (o el jugador fuerza la situación con los botones de debug).
 */
function drivingState(
  trip: Trip,
  cursorTimestamp: number,
  cursorDistanceKm: number,
  cursorFuelLiters: number,
  now: number,
  targetDistanceKm: number,
  upcomingFuelStop?: FuelStop,
): TripState {
  const elapsedHours = Math.max(0, (now - cursorTimestamp) / 1000 / 3600)
  const maxTravelByTimeKm = trip.averageSpeedKmh * elapsedHours
  const headingBackward = targetDistanceKm < cursorDistanceKm
  const desiredDistanceKm = headingBackward
    ? Math.max(cursorDistanceKm - maxTravelByTimeKm, targetDistanceKm)
    : Math.min(cursorDistanceKm + maxTravelByTimeKm, targetDistanceKm)
  const desiredTravelKm = Math.abs(desiredDistanceKm - cursorDistanceKm)

  const autonomyLimitKm = autonomyKm(cursorFuelLiters, trip.fuelConsumptionPer100Km)
  const stranded = desiredTravelKm > autonomyLimitKm
  const distanceTravelledKm = stranded
    ? headingBackward
      ? cursorDistanceKm - autonomyLimitKm
      : cursorDistanceKm + autonomyLimitKm
    : desiredDistanceKm

  // Nunca en negativo — ni aunque el redondeo deje una fracción de litro de más
  // al llegar justo al límite de la autonomía.
  const fuelLiters = Math.max(
    0,
    cursorFuelLiters - fuelForDistanceKm(Math.abs(distanceTravelledKm - cursorDistanceKm), trip.fuelConsumptionPer100Km),
  )
  const { position, bearing } = positionAtDistance(trip.route, distanceTravelledKm)

  return {
    status: stranded ? 'stranded' : distanceTravelledKm >= trip.route.distanceTotalKm ? 'arrived' : 'in_transit',
    distanceTravelledKm,
    progress: distanceTravelledKm / trip.route.distanceTotalKm,
    position,
    bearing,
    remainingKm: trip.route.distanceTotalKm - distanceTravelledKm,
    fuelLiters,
    upcomingFuelStop,
  }
}

/** Cuánto dura el viaje completo (manejo + paradas), para mostrar la llegada estimada.
 *  Cada parada suma sus 5 minutos fijos de carga MÁS el desvío de ida y vuelta hasta
 *  la gasolinera (puede no estar sobre el camino — ver `planFuelStops`). */
export function estimateArrivalWithStops(
  departureTimestamp: number,
  distanceTotalKm: number,
  averageSpeedKmh: number,
  fuelStops: FuelStop[],
): number {
  const stopsOverheadMs = fuelStops.reduce((total, stop) => {
    const detourRoundTripMs = ((2 * stop.detourOneWayKm) / averageSpeedKmh) * 3_600_000
    return total + detourRoundTripMs + REFUEL_STOP_DURATION_MS
  }, 0)
  return estimateArrivalTimestamp(departureTimestamp, distanceTotalKm, averageSpeedKmh) + stopsOverheadMs
}
