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

  it('a mitad de un segmento largo mantiene el rumbo propio, sin anticipar el giro de la próxima esquina', () => {
    // Un segmento artificialmente largo (~111km) simula el desvío hacia una
    // gasolinera lejana: a mitad de camino todavía tiene que apuntar al norte
    // (rumbo de ESTE segmento), no ya estar girando hacia el este (el próximo).
    const halfFirstSegment = route.cumulativeDistanceKm[1] / 2
    const { position, bearing } = positionAtDistance(route, halfFirstSegment)
    expect(position[0]).toBeCloseTo(0, 3)
    expect(position[1]).toBeGreaterThan(0)
    expect(position[1]).toBeLessThan(1)
    expect(bearing).toBeCloseTo(0, 0)
  })

  it('recién gira hacia el rumbo del próximo segmento en el último tramito antes de la esquina', () => {
    const segmentEndKm = route.cumulativeDistanceKm[1]
    const justBeforeCorner = positionAtDistance(route, segmentEndKm - 0.0001)
    expect(justBeforeCorner.bearing).toBeCloseTo(90, 0) // ya casi llegando, gira hacia el este

    const wellBeforeCorner = positionAtDistance(route, segmentEndKm - 5)
    expect(wellBeforeCorner.bearing).toBeCloseTo(0, 0) // 5km antes, todavía derecho al norte
  })

  it('clampea distancias fuera de rango', () => {
    const beyond = positionAtDistance(route, route.distanceTotalKm + 999)
    expect(beyond.position[0]).toBeCloseTo(1, 3)
    expect(beyond.position[1]).toBeCloseTo(1, 3)
  })
})
