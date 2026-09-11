import { describe, expect, it } from 'vitest'
import { buildRouteData, positionAtDistance } from './route'

describe('buildRouteData', () => {
  it('acumula distancia y coincide con el total', () => {
    // Buenos Aires -> Rosario aprox, en línea recta con un punto intermedio
    const route = buildRouteData('buenos-aires', 'rosario', [
      [-58.3816, -34.6037],
      [-59.5, -33.8],
      [-60.6393, -32.9468],
    ])

    expect(route.cumulativeDistanceKm[0]).toBe(0)
    expect(route.cumulativeDistanceKm.at(-1)).toBeCloseTo(route.distanceTotalKm, 5)
    expect(route.distanceTotalKm).toBeGreaterThan(200)
    expect(route.distanceTotalKm).toBeLessThan(320)
  })
})

describe('positionAtDistance', () => {
  const route = buildRouteData('a', 'b', [
    [0, 0],
    [0, 1], // ~111km al norte
    [1, 1], // ~111km al este
  ])

  it('devuelve el origen a distancia 0', () => {
    const { position } = positionAtDistance(route, 0)
    expect(position[0]).toBeCloseTo(0, 5)
    expect(position[1]).toBeCloseTo(0, 5)
  })

  it('devuelve el destino a la distancia total', () => {
    const { position } = positionAtDistance(route, route.distanceTotalKm)
    expect(position[0]).toBeCloseTo(1, 3)
    expect(position[1]).toBeCloseTo(1, 3)
  })

  it('el bearing es exactamente el del segmento actual al arrancarlo', () => {
    const { bearing } = positionAtDistance(route, 0)
    expect(bearing).toBeCloseTo(0, 0) // primer segmento: derecho al norte
  })

  it('mezcla suavemente el bearing hacia el próximo segmento a mitad de camino', () => {
    // Con geometrías reales (miles de puntos, segmentos cortos) esta mezcla es
    // imperceptible; acá el segmento es artificialmente largo (~111km) para el test,
    // así que a mitad de camino ya se nota el promedio entre norte (0°) y este (90°).
    const halfFirstSegment = route.cumulativeDistanceKm[1] / 2
    const { position, bearing } = positionAtDistance(route, halfFirstSegment)
    expect(position[0]).toBeCloseTo(0, 3)
    expect(position[1]).toBeGreaterThan(0)
    expect(position[1]).toBeLessThan(1)
    expect(bearing).toBeCloseTo(45, 0)
  })

  it('clampea distancias fuera de rango', () => {
    const beyond = positionAtDistance(route, route.distanceTotalKm + 999)
    expect(beyond.position[0]).toBeCloseTo(1, 3)
    expect(beyond.position[1]).toBeCloseTo(1, 3)
  })
})
