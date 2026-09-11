import { describe, expect, it } from 'vitest'
import { ensureFuelPriceHistory, getCurrentFuelPrice } from './fuelPrice'

const HOUR_MS = 3_600_000

describe('ensureFuelPriceHistory', () => {
  it('arranca en el precio base cuando el historial está vacío', () => {
    const now = 1_700_000_000_000
    const history = ensureFuelPriceHistory([], now, now)
    expect(history).toHaveLength(1)
    expect(getCurrentFuelPrice(history)).toBe(5_000)
  })

  it('es determinista: la misma hora siempre da el mismo precio, sin importar si se calculó de una vez o de a poco', () => {
    const genesis = 1_700_000_000_000
    const laterNow = genesis + 5 * HOUR_MS

    const straightThrough = ensureFuelPriceHistory([], laterNow, genesis)
    const stepByStep = [genesis, genesis + HOUR_MS, genesis + 2 * HOUR_MS, genesis + 3 * HOUR_MS, laterNow].reduce(
      (history, t) => ensureFuelPriceHistory(history, t, genesis),
      [] as ReturnType<typeof ensureFuelPriceHistory>,
    )

    expect(getCurrentFuelPrice(straightThrough)).toBe(getCurrentFuelPrice(stepByStep))
  })

  it('recorta el historial a las últimas 24 horas', () => {
    const genesis = 1_700_000_000_000
    const muchLater = genesis + 100 * HOUR_MS
    const history = ensureFuelPriceHistory([], muchLater, genesis)
    expect(history.length).toBeLessThanOrEqual(24)
  })

  it('el precio nunca sale del rango [1500, 15000]', () => {
    const genesis = 1_700_000_000_000
    let history = ensureFuelPriceHistory([], genesis, genesis)
    for (let i = 1; i <= 200; i++) {
      history = ensureFuelPriceHistory(history, genesis + i * HOUR_MS, genesis)
      const price = getCurrentFuelPrice(history)
      expect(price).toBeGreaterThanOrEqual(1_500)
      expect(price).toBeLessThanOrEqual(15_000)
    }
  })
})
