import { describe, expect, it } from 'vitest'
import { LOAN_OPTIONS, quoteLoan } from './loan'

describe('quoteLoan', () => {
  it('da cuotas diarias redondas para las 3 opciones', () => {
    const quotes = LOAN_OPTIONS.map(quoteLoan)
    expect(quotes[0]).toEqual({ totalToRepay: 60_000_000, dailyQuota: 600_000 })
    expect(quotes[1]).toEqual({ totalToRepay: 125_000_000, dailyQuota: 1_000_000 })
    expect(quotes[2]).toEqual({ totalToRepay: 325_000_000, dailyQuota: 1_300_000 })
  })
})
