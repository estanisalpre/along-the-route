import { describe, expect, it } from 'vitest'
import { settleTrip } from './economy'

describe('settleTrip', () => {
  it('ya no descuenta el combustible de nuevo al cobrar — ya se pagó real en cada parada (ver core/fuelPlan.ts)', () => {
    // Mismo viaje de 300km del ejemplo original de DESIGN.md (payout $850.000,
    // peajes $75.000, mantenimiento $45.000), pero el combustible real pagado
    // en ruta ($180.000, el mismo número de aquel ejemplo) se pasa como dato,
    // no se recalcula ni se resta dos veces.
    const settlement = settleTrip(300, 850_000, 180_000)
    expect(settlement.fuelCost).toBe(180_000)
    expect(settlement.tollCost).toBe(75_000)
    expect(settlement.maintenanceCost).toBe(45_000)
    expect(settlement.netProfit).toBe(730_000)
  })

  it('sin paradas de combustible (viaje corto, no hizo falta repostar) la ganancia no descuenta nada de combustible', () => {
    const settlement = settleTrip(300, 850_000, 0)
    expect(settlement.fuelCost).toBe(0)
    expect(settlement.netProfit).toBe(730_000)
  })
})
