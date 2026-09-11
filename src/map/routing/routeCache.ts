import type { City } from '../../core/cities'
import type { RouteData } from '../../core/route'
import { fetchRoute } from './osrmProvider'

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
