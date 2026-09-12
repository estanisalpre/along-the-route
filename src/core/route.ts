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

// Cuán cerca (en km) de la esquina siguiente arranca a girar el vehículo hacia el rumbo
// del próximo tramo — no antes. En polylines reales (la ruta azul, con puntos cada
// pocos metros) esta ventana casi siempre termina siendo el segmento entero, así que
// no cambia nada; en tramos largos y con pocos puntos (el desvío verde hacia una
// gasolinera) es lo que evita que el vehículo "anticipe" el giro mucho antes de llegar.
const TURN_SMOOTHING_KM = 0.05

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
  const segmentLengthKm = segmentEnd - segmentStart
  const t = segmentLengthKm > 0 ? (clamped - segmentStart) / segmentLengthKm : 0

  const [lon1, lat1] = route.geometry[lo]
  const [lon2, lat2] = route.geometry[hi]

  // El giro hacia el rumbo del PRÓXIMO tramo se reparte solo en el último tramito antes
  // de la esquina (o el segmento entero, si ya es más corto que eso) — el resto del
  // segmento mantiene el rumbo propio, sin ir "adelantando" el giro de lejos.
  const smoothingWindowKm = Math.min(TURN_SMOOTHING_KM, segmentLengthKm)
  const distanceIntoSegmentKm = clamped - segmentStart
  const turnT =
    smoothingWindowKm > 0
      ? Math.max(0, Math.min(1, (distanceIntoSegmentKm - (segmentLengthKm - smoothingWindowKm)) / smoothingWindowKm))
      : 1

  return {
    position: [lerp(lon1, lon2, t), lerp(lat1, lat2, t)],
    bearing: lerpAngleDegrees(route.bearingAt[lo], route.bearingAt[hi] ?? route.bearingAt[lo], turnT),
  }
}
