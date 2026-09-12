import { AnimatePresence, motion } from 'framer-motion'
import { CITIES } from '../../core/cities'
import type { Cargo } from '../../core/cargo'
import { settleTrip } from '../../core/economy'
import { effectiveConsumptionPer100Km, fuelForDistanceKm } from '../../core/fuel'
import { formatArs, formatDuration } from '../../core/format'
import { getCurrentFuelPrice, type FuelPriceEntry } from '../../core/fuelPrice'
import type { Garage } from '../../core/garage'
import type { Vehicle } from '../../core/vehicle'
import { FuelMarketSection } from '../market/FuelMarketSection'

interface MercadoViewProps {
  cargoOffers: Cargo[]
  vehicles: Vehicle[]
  now: number
  onAccept: (cargo: Cargo) => void
  garages: Garage[]
  fuelPriceHistory: FuelPriceEntry[]
  cash: number
  initialFuelGarageId: string | null
  onBuyFuel: (garageId: string, liters: number) => void
}

export function MercadoView({
  cargoOffers,
  vehicles,
  now,
  onAccept,
  garages,
  fuelPriceHistory,
  cash,
  initialFuelGarageId,
  onBuyFuel,
}: MercadoViewProps) {
  // Todo el lote vence junto (ver core/cargoMarket.ts) — alcanza con mirar cualquier oferta.
  const expiresAt = cargoOffers[0]?.expiresAt
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <h2 className="mb-1 text-xl font-semibold text-white">Mercado de cargas</h2>
      <p className="mb-6 text-sm text-neutral-400">
        Una carga por cada ciudad del país — aceptar una necesita un vehículo libre con chofer en la ciudad de origen.
        {expiresAt && expiresAt > now && <> Este lote se renueva en {formatDuration(expiresAt - now)}.</>}
      </p>

      {cargoOffers.length === 0 && (
        <p className="text-sm text-neutral-500">No hay cargas disponibles ahora mismo — probá de nuevo en un rato.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {cargoOffers.map((cargo, i) => {
            const origin = CITIES.find((c) => c.id === cargo.originCityId)!
            const destination = CITIES.find((c) => c.id === cargo.destinationCityId)!
            const fittingVehicle = vehicles.find(
              (v) =>
                v.status === 'available' &&
                v.driverId &&
                v.currentCityId === cargo.originCityId &&
                v.capacityKg >= cargo.weightKg,
            )
            // Estimación optimista: asume que el combustible sale del garage
            // (precio de mercado), sin las paradas en ruta que capaz hagan
            // falta a +10% — se sabe recién al aceptar (ver core/fuelPlan.ts).
            const estimatedFuelCost = fittingVehicle?.fuelConsumptionPer100Km
              ? Math.round(
                  fuelForDistanceKm(
                    cargo.distanceKm,
                    effectiveConsumptionPer100Km(
                      fittingVehicle.fuelConsumptionPer100Km,
                      fittingVehicle.cruiseSpeedKmh ?? fittingVehicle.averageSpeedKmh,
                      fittingVehicle.averageSpeedKmh,
                    ),
                  ) * getCurrentFuelPrice(fuelPriceHistory),
                )
              : 0
            const settlement = settleTrip(cargo.distanceKm, cargo.payout, estimatedFuelCost)

            return (
              <motion.div
                key={cargo.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    {origin.name} → {destination.name}
                  </span>
                  <span className="text-xs text-neutral-500">{cargo.distanceKm.toFixed(0)} km</span>
                </div>
                <div className="mt-1 text-sm text-neutral-400">
                  {cargo.category} — {cargo.weightKg.toLocaleString('es-AR')} kg
                </div>

                <div className="mt-3 space-y-1 text-xs text-neutral-500">
                  <div className="flex justify-between">
                    <span>Pago</span>
                    <span className="text-neutral-300">{formatArs(cargo.payout)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gastos estimados</span>
                    <span className="text-neutral-300">
                      {formatArs(settlement.fuelCost + settlement.tollCost + settlement.maintenanceCost)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-3">
                  <span className="text-sm font-semibold text-emerald-400">{formatArs(settlement.netProfit)}</span>
                  <button
                    type="button"
                    disabled={!fittingVehicle}
                    onClick={() => onAccept(cargo)}
                    className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                      fittingVehicle
                        ? 'bg-orange-500 text-white hover:bg-orange-400'
                        : 'cursor-not-allowed bg-neutral-700 text-neutral-500'
                    }`}
                    title={
                      fittingVehicle
                        ? undefined
                        : 'Ningún vehículo libre con chofer asignado en esa ciudad puede con este peso'
                    }
                  >
                    Aceptar
                  </button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <FuelMarketSection
        key={initialFuelGarageId ?? 'default'}
        garages={garages}
        fuelPriceHistory={fuelPriceHistory}
        cash={cash}
        initialGarageId={initialFuelGarageId}
        onBuy={onBuyFuel}
      />
    </div>
  )
}
