import { bearingDegrees, haversineDistanceKm, type LonLat } from './geo'

export interface RouteData {
  originCityId: string
  destinationCityId: string
  geometry: LonLat[]
  /** Distancia acumulada en km hasta cada punto de `geometry` (mismo largo que geometry). */
  cumulativeDistanceKm: number[]
  /** Bearing (0-360) desde cada punto hacia el siguiente; el último repite el anterior. */
  bearingAt: number[]
  distanceTotalKm: number
}

/** Precomputa distancia acumulada y bearing a partir de una polyline cruda [lon, lat][]. */
export function buildRouteData(
  originCityId: string,
  destinationCityId: string,
  geometry: LonLat[],
): RouteData {
  if (geometry.length < 2) {
    throw new Error('Una ruta necesita al menos 2 puntos')
  }

  const cumulativeDistanceKm: number[] = [0]
  const bearingAt: number[] = []

  for (let i = 0; i < geometry.length - 1; i++) {
    const segmentKm = haversineDistanceKm(geometry[i], geometry[i + 1])
    cumulativeDistanceKm.push(cumulativeDistanceKm[i] + segmentKm)
    bearingAt.push(bearingDegrees(geometry[i], geometry[i + 1]))
  }
  bearingAt.push(bearingAt[bearingAt.length - 1])

  return {
    originCityId,
    destinationCityId,
    geometry,
    cumulativeDistanceKm,
    bearingAt,
    distanceTotalKm: cumulativeDistanceKm[cumulativeDistanceKm.length - 1],
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpAngleDegrees(a: number, b: number, t: number): number {
  let delta = ((b - a + 540) % 360) - 180
  return (a + delta * t + 360) % 360
}

export interface RoutePosition {
  position: LonLat
  bearing: number
}

/** Busca la posición interpolada y el bearing a una distancia recorrida dada (en km). */
export function positionAtDistance(route: RouteData, distanceKm: number): RoutePosition {
  const clamped = Math.min(Math.max(distanceKm, 0), route.distanceTotalKm)

  // Búsqueda binaria del segmento [i, i+1] que contiene `clamped`.
  let lo = 0
  let hi = route.cumulativeDistanceKm.length - 1
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (route.cumulativeDistanceKm[mid] <= clamped) lo = mid
    else hi = mid
  }

  const segmentStart = route.cumulativeDistanceKm[lo]
  const segmentEnd = route.cumulativeDistanceKm[hi]
  const t = segmentEnd > segmentStart ? (clamped - segmentStart) / (segmentEnd - segmentStart) : 0

  const [lon1, lat1] = route.geometry[lo]
  const [lon2, lat2] = route.geometry[hi]

  return {
    position: [lerp(lon1, lon2, t), lerp(lat1, lat2, t)],
    bearing: lerpAngleDegrees(route.bearingAt[lo], route.bearingAt[hi] ?? route.bearingAt[lo], t),
  }
}
