import type { City } from '../../core/cities'
import type { LonLat } from '../../core/geo'
import type { RouteData } from '../../core/route'
import { fetchRoute, fetchRouteBetweenPoints } from './osrmProvider'

const cache = new Map<string, Promise<RouteData>>()

/**
 * Igual que `fetchRoute`, pero reutiliza la promesa de una ruta ya pedida entre
 * el mismo par de ciudades — con un mapa chico de ciudades, la mayoría de las
 * rutas se calculan una sola vez por sesión (ver DESIGN.md §7).
 */
export function getCachedRoute(origin: City, destination: City): Promise<RouteData> {
  const key = `${origin.id}__${destination.id}`
  const existing = cache.get(key)
  if (existing) return existing

  const promise = fetchRoute(origin, destination)
  cache.set(key, promise)
  promise.catch(() => cache.delete(key)) // no cachear fallos, permitir reintentar
  return promise
}

const detourCache = new Map<string, Promise<RouteData>>()

function pointKey(point: LonLat): string {
  return `${point[0].toFixed(4)},${point[1].toFixed(4)}`
}

/**
 * Igual que `getCachedRoute`, pero para el desvío hacia una gasolinera — el
 * origen es un punto cualquiera de la ruta (no una ciudad), así que se cachea
 * por coordenadas en vez de por id (ver `core/fuelPlan.ts` y Dashboard.tsx
 * `resolveDetourRoutes`).
 */
export function getCachedDetourRoute(origin: LonLat, destination: LonLat): Promise<RouteData> {
  const key = `${pointKey(origin)}__${pointKey(destination)}`
  const existing = detourCache.get(key)
  if (existing) return existing

  const promise = fetchRouteBetweenPoints(origin, destination, 'desvío-origen', 'desvío-gasolinera')
  detourCache.set(key, promise)
  promise.catch(() => detourCache.delete(key))
  return promise
}
