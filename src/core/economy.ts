// Tarifas planas por km, calibradas para coincidir con el ejemplo de docs/DESIGN.md
// (ruta de 300km: -$75.000 peajes, -$45.000 mantenimiento).
export const TOLL_COST_PER_KM = 250
export const MAINTENANCE_COST_PER_KM = 150
export const EXPENSE_PER_KM = TOLL_COST_PER_KM + MAINTENANCE_COST_PER_KM

export interface TripSettlement {
  payout: number
  fuelCost: number
  tollCost: number
  maintenanceCost: number
  netProfit: number
}

/**
 * El combustible ya NO es una tarifa plana estimada por km: se paga real, litro a
 * litro, en cada parada a repostar (ver core/fuelPlan.ts) — se descuenta de la
 * caja en el momento en que ocurre la parada, no acá. `fuelCost` acá es solo la
 * suma de esas paradas, para mostrarlo en el resumen del viaje al cobrarlo (no
 * se resta de nuevo, ya se restó cuando pasó).
 */
export function settleTrip(distanceKm: number, payout: number, fuelCost: number): TripSettlement {
  const tollCost = Math.round(distanceKm * TOLL_COST_PER_KM)
  const maintenanceCost = Math.round(distanceKm * MAINTENANCE_COST_PER_KM)
  return {
    payout,
    fuelCost,
    tollCost,
    maintenanceCost,
    netProfit: payout - tollCost - maintenanceCost,
  }
}
