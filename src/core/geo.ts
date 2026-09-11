export type LonLat = [number, number]

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Distancia en km entre dos puntos [lon, lat] usando la fórmula de haversine. */
export function haversineDistanceKm(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const h = sinDLat * sinDLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLon * sinDLon
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** Bearing (0-360, 0 = norte) desde el punto a hacia el punto b. */
export function bearingDegrees(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))
  const bearing = (Math.atan2(y, x) * 180) / Math.PI
  return (bearing + 360) % 360
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

/** Punto a `distanceKm` de `from`, en dirección `bearingDeg` (0 = norte). Inversa de bearingDegrees. */
export function destinationPoint(from: LonLat, bearingDeg: number, distanceKm: number): LonLat {
  const [lon1, lat1] = from
  const angularDistance = distanceKm / EARTH_RADIUS_KM
  const bearing = toRad(bearingDeg)
  const lat1Rad = toRad(lat1)

  const lat2 = Math.asin(
    Math.sin(lat1Rad) * Math.cos(angularDistance) + Math.cos(lat1Rad) * Math.sin(angularDistance) * Math.cos(bearing),
  )
  const lon2 =
    toRad(lon1) +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1Rad),
      Math.cos(angularDistance) - Math.sin(lat1Rad) * Math.sin(lat2),
    )

  return [toDeg(lon2), toDeg(lat2)]
}
