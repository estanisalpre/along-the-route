import { buildRouteData, type RouteData } from '../../core/route'
import type { LonLat } from '../../core/geo'
import type { City } from '../../core/cities'

// El servidor demo público de OSRM: gratis, sin API key, y con CORS abierto
// (`Access-Control-Allow-Origin: *`) — a diferencia de OpenRouteService, cuya
// clave gratuita se puede agotar de cuota (queda bloqueada con un error que el
// navegador reporta como "CORS" aunque el problema real sea otro). No es un
// servicio pensado para producción real (así lo aclara el propio proyecto
// OSRM — sin garantías de disponibilidad ni límite de uso documentado), pero
// alcanza y sobra para desarrollo/testing sin depender de que a nadie se le
// acabe una cuota. Para producción, ver docs/DESIGN.md — hospedar un OSRM
// propio o pasar a un plan pago es trabajo para más adelante.
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'

interface OsrmResponse {
  code: string
  routes: { geometry: { coordinates: LonLat[] } }[]
}

/**
 * Pide a OSRM la ruta real entre dos puntos [lon, lat] cualquiera — no hace
 * falta que sean ciudades del dataset, sirve igual para el desvío hacia una
 * gasolinera (ver `fetchRoute` abajo y `routeCache.ts` `getCachedDetourRoute`).
 */
export async function fetchRouteBetweenPoints(origin: LonLat, destination: LonLat, originId: string, destinationId: string): Promise<RouteData> {
  const url = `${OSRM_BASE_URL}/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson`
  const response = await fetch(url)

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OSRM respondió ${response.status}: ${body}`)
  }

  const data = (await response.json()) as OsrmResponse
  if (data.code !== 'Ok') {
    throw new Error(`OSRM no pudo calcular la ruta (${data.code})`)
  }

  const geometry = data.routes[0]?.geometry.coordinates
  if (!geometry || geometry.length < 2) {
    throw new Error('OSRM no devolvió una geometría válida')
  }

  return buildRouteData(originId, destinationId, geometry)
}

/**
 * Pide a OSRM la ruta real entre dos ciudades y devuelve un `RouteData` ya
 * preprocesado (distancia acumulada + bearing por punto).
 */
export async function fetchRoute(origin: City, destination: City): Promise<RouteData> {
  return fetchRouteBetweenPoints([origin.lon, origin.lat], [destination.lon, destination.lat], origin.id, destination.id)
}
