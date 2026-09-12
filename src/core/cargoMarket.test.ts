import { describe, expect, it } from 'vitest'
import type { City } from './cities'
import { cargoMarketCycleIndex, cargoMarketExpiresAt, CARGO_MARKET_CYCLE_MS, pickCargoMarketPairs } from './cargoMarket'

function makeCities(count: number): City[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `city-${i}`,
    name: `Ciudad ${i}`,
    province: 'Provincia',
    lat: i,
    lon: i,
    population: 1000,
  }))
}

describe('cargoMarketCycleIndex', () => {
  it('da el mismo número para cualquier instante dentro de las mismas 6 horas', () => {
    const start = cargoMarketCycleIndex(0)
    const almostSixHoursLater = cargoMarketCycleIndex(CARGO_MARKET_CYCLE_MS - 1)
    const sixHoursLater = cargoMarketCycleIndex(CARGO_MARKET_CYCLE_MS)
    expect(almostSixHoursLater).toBe(start)
    expect(sixHoursLater).toBe(start + 1)
  })

  it('es puramente función del reloj — no depende de cuándo arrancó cada empresa', () => {
    // Dos "empresas" con historias distintas, mismo instante real: mismo ciclo.
    const now = 1_800_000_000_000
    expect(cargoMarketCycleIndex(now)).toBe(cargoMarketCycleIndex(now))
  })
})

describe('cargoMarketExpiresAt', () => {
  it('vence justo al arrancar el próximo ciclo', () => {
    const cycle = cargoMarketCycleIndex(1_800_000_000_000)
    expect(cargoMarketExpiresAt(cycle)).toBe((cycle + 1) * CARGO_MARKET_CYCLE_MS)
  })
})

describe('pickCargoMarketPairs', () => {
  const cities = makeCities(50)

  it('devuelve exactamente una oferta por cada ciudad — ninguna se queda sin nada', () => {
    const pairs = pickCargoMarketPairs(123, cities)
    expect(pairs).toHaveLength(cities.length)
    expect(new Set(pairs.map((p) => p.origin.id)).size).toBe(cities.length)
  })

  it('es determinista: mismo ciclo + mismas ciudades siempre da los mismos pares', () => {
    const a = pickCargoMarketPairs(123, cities)
    const b = pickCargoMarketPairs(123, cities)
    expect(a.map((p) => `${p.origin.id}-${p.destination.id}`)).toEqual(b.map((p) => `${p.origin.id}-${p.destination.id}`))
  })

  it('ciclos distintos dan lotes distintos', () => {
    const a = pickCargoMarketPairs(1, cities)
    const b = pickCargoMarketPairs(2, cities)
    expect(a.map((p) => `${p.origin.id}-${p.destination.id}`)).not.toEqual(
      b.map((p) => `${p.origin.id}-${p.destination.id}`),
    )
  })

  it('nunca elige la misma ciudad como origen y destino', () => {
    const pairs = pickCargoMarketPairs(42, cities)
    for (const pair of pairs) {
      expect(pair.origin.id).not.toBe(pair.destination.id)
    }
  })

  it('estima la distancia en línea recta (mayor a 0, sin llamar a ninguna red)', () => {
    const pairs = pickCargoMarketPairs(7, cities)
    for (const pair of pairs) {
      expect(pair.estimatedDistanceKm).toBeGreaterThan(0)
    }
  })
})
