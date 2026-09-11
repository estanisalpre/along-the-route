import { autonomyKm, fuelForDistanceKm, REFUEL_STOP_DURATION_MS } from './fuel'
import { haversineDistanceKm } from './geo'
import type { GasStation } from './gasStation'
import type { RouteData } from './route'
import type { FuelStop } from './trip'

const MAX_DETOUR_FROM_ROUTE_KM = 15
const MAX_STOPS_PER_TRIP = 6

interface ProjectedStation {
  station: GasStation
  /** A qué distancia acumulada de la ruta cae esta gasolinera. */
  atDistanceKm: number
}

/**
 * Proyecta cada gasolinera sobre la ruta: a qué distancia acumulada cae (la
 * del vértice de la geometría más cercano) — y descarta las que están
 * demasiado lejos del camino como para considerarse "de paso". No es una
 * proyección geométrica exacta sobre el segmento (punto-a-segmento): con la
 * cantidad de puntos que trae una ruta real ya alcanza, y evita resolver
 * geometría de segmentos para cada gasolinera candidata.
 */
function projectStationsOntoRoute(route: RouteData, stations: GasStation[]): ProjectedStation[] {
  const projected: ProjectedStation[] = []
  for (const station of stations) {
    let bestIndex = 0
    let bestDetourKm = Infinity
    for (let i = 0; i < route.geometry.length; i++) {
      const detourKm = haversineDistanceKm([station.lon, station.lat], route.geometry[i])
      if (detourKm < bestDetourKm) {
        bestDetourKm = detourKm
        bestIndex = i
      }
    }
    if (bestDetourKm <= MAX_DETOUR_FROM_ROUTE_KM) {
      projected.push({ station, atDistanceKm: route.cumulativeDistanceKm[bestIndex] })
    }
  }
  return projected
}

/**
 * Arma la lista de paradas de combustible necesarias para completar la ruta
 * sin volver nunca atrás: si el tanque no alcanza para llegar, busca la
 * gasolinera alcanzable más lejana posible (para minimizar cuántas paradas
 * hacen falta), repostea hasta `refuelTargetLiters` y repite desde ahí.
 *
 * Esta es la implementación de "el chofer va solo a cargar antes de
 * quedarse sin combustible" — se decide TODA de una vez, al aceptar el
 * viaje, en vez de perseguir al vehículo en vivo turno a turno. Es lo mismo
 * que describe docs/MECHANICS.md §2: "el sistema fuerza una parada de carga,
 * sin drama" — el viaje ya sale con las paradas necesarias agendadas.
 *
 * Si en algún punto no hay ninguna gasolinera alcanzable dentro del rango
 * actual, se deja de agendar más paradas — es el riesgo que asume el
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
): Omit<FuelStop, 'arrivalTimestamp' | 'departureTimestamp' | 'paid'>[] {
  const projected = projectStationsOntoRoute(route, stations)
  const cappedTarget = Math.min(refuelTargetLiters, tankCapacityLiters)
  const stops: Omit<FuelStop, 'arrivalTimestamp' | 'departureTimestamp' | 'paid'>[] = []

  let fuelLiters = startingFuelLiters
  let positionKm = 0

  while (stops.length < MAX_STOPS_PER_TRIP) {
    const reachKm = positionKm + autonomyKm(fuelLiters, consumptionPer100Km)
    if (reachKm >= route.distanceTotalKm) break // llega sin problema

    let best: ProjectedStation | undefined
    for (const entry of projected) {
      if (entry.atDistanceKm <= positionKm || entry.atDistanceKm > reachKm) continue
      if (!best || entry.atDistanceKm > best.atDistanceKm) best = entry
    }
    if (!best) break // no hay gasolinera alcanzable — se asume el riesgo

    const fuelAtStop = fuelLiters - fuelForDistanceKm(best.atDistanceKm - positionKm, consumptionPer100Km)
    const litersAdded = Math.max(0, cappedTarget - fuelAtStop)
    if (litersAdded <= 0) break // el objetivo de recarga no alcanza para avanzar — evita loop infinito

    stops.push({
      gasStationId: best.station.id,
      atDistanceKm: best.atDistanceKm,
      litersAdded,
      cost: Math.round(litersAdded * currentStationPrice),
    })

    fuelLiters = fuelAtStop + litersAdded
    positionKm = best.atDistanceKm
  }

  return stops
}

/** Convierte las paradas (en distancia) en paradas con horarios reales, y calcula
 *  la llegada estimada final — cada parada suma sus 5 minutos fijos al viaje. */
export function scheduleFuelStops(
  stopsByDistance: Omit<FuelStop, 'arrivalTimestamp' | 'departureTimestamp' | 'paid'>[],
  departureTimestamp: number,
  averageSpeedKmh: number,
): { fuelStops: FuelStop[]; drivingAndStopsEndTimestamp: number } {
  let cursorTimestamp = departureTimestamp
  let cursorDistanceKm = 0

  const fuelStops: FuelStop[] = stopsByDistance.map((stop) => {
    const drivingMs = ((stop.atDistanceKm - cursorDistanceKm) / averageSpeedKmh) * 3_600_000
    const arrivalTimestamp = cursorTimestamp + drivingMs
    const departureTimestampAtStop = arrivalTimestamp + REFUEL_STOP_DURATION_MS
    cursorTimestamp = departureTimestampAtStop
    cursorDistanceKm = stop.atDistanceKm
    return { ...stop, arrivalTimestamp, departureTimestamp: departureTimestampAtStop, paid: false }
  })

  return { fuelStops, drivingAndStopsEndTimestamp: cursorTimestamp }
}
