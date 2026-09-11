import { useState } from 'react'
import { CITIES } from '../../core/cities'
import { formatArs } from '../../core/format'
import { getCurrentFuelPrice, type FuelPriceEntry } from '../../core/fuelPrice'
import { GARAGE_TIERS, type Garage } from '../../core/garage'
import { FuelPriceChart } from './FuelPriceChart'

interface FuelMarketSectionProps {
  garages: Garage[]
  fuelPriceHistory: FuelPriceEntry[]
  cash: number
  initialGarageId: string | null
  onBuy: (garageId: string, liters: number) => void
}

export function FuelMarketSection({ garages, fuelPriceHistory, cash, initialGarageId, onBuy }: FuelMarketSectionProps) {
  // El padre le pone un `key` distinto a este componente cada vez que cambia
  // `initialGarageId` (ver MercadoView), así que un cambio de "a qué garage
  // vine a cargar combustible" se resuelve remontando el componente en vez de
  // sincronizar la prop a state con un efecto.
  const [garageId, setGarageId] = useState<string | null>(initialGarageId ?? garages[0]?.id ?? null)
  const [liters, setLiters] = useState(0)

  const price = getCurrentFuelPrice(fuelPriceHistory)
  const garage = garages.find((g) => g.id === garageId) ?? null
  const tier = garage ? GARAGE_TIERS.find((t) => t.id === garage.tierId)! : null
  const maxLiters = garage && tier ? Math.max(0, tier.fuelTankCapacityLiters - garage.fuelLiters) : 0
  const totalCost = liters * price
  const canBuy = garage !== null && liters > 0 && liters <= maxLiters && totalCost <= cash

  return (
    <div className="mt-10 border-t border-neutral-800 pt-6">
      <h3 className="text-lg font-semibold text-white">Combustible</h3>
      <p className="mb-4 text-sm text-neutral-400">
        El precio se actualiza cada hora real y puede subir o bajar hasta un 75% respecto al anterior.
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <FuelPriceChart history={fuelPriceHistory} />
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-400">Precio actual</div>
          <div className="text-2xl font-bold text-white">
            {formatArs(price)} <span className="text-sm font-normal text-neutral-400">/ L</span>
          </div>

          {garages.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-500">Todavía no tenés ningún garage.</p>
          ) : (
            <>
              <label className="mt-4 block text-xs text-neutral-400" htmlFor="fuel-garage-select">
                Garage destino
              </label>
              <select
                id="fuel-garage-select"
                value={garageId ?? ''}
                onChange={(e) => {
                  setGarageId(e.target.value)
                  setLiters(0)
                }}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
              >
                {garages.map((g) => {
                  const gTier = GARAGE_TIERS.find((t) => t.id === g.tierId)!
                  const city = CITIES.find((c) => c.id === g.cityId)!
                  return (
                    <option key={g.id} value={g.id}>
                      {city.name} — {g.fuelLiters}/{gTier.fuelTankCapacityLiters} L
                    </option>
                  )
                })}
              </select>

              <label className="mt-4 block text-xs text-neutral-400" htmlFor="fuel-liters-range">
                Litros a comprar
              </label>
              <input
                id="fuel-liters-range"
                type="range"
                min={0}
                max={maxLiters}
                step={Math.max(1, Math.round(maxLiters / 100))}
                value={liters}
                onChange={(e) => setLiters(Number(e.target.value))}
                disabled={maxLiters === 0}
                className="mt-2 w-full accent-sky-500"
              />
              <div className="mt-1 flex justify-between text-sm text-white">
                <span>{liters.toLocaleString('es-AR')} L</span>
                <span className="text-neutral-400">máx {maxLiters.toLocaleString('es-AR')} L</span>
              </div>

              <div className="mt-3 flex justify-between border-t border-neutral-800 pt-3 text-sm">
                <span className="text-neutral-400">Total</span>
                <span className="font-semibold text-white">{formatArs(totalCost)}</span>
              </div>

              <button
                type="button"
                disabled={!canBuy}
                onClick={() => {
                  onBuy(garageId!, liters)
                  setLiters(0)
                }}
                className={`mt-3 w-full rounded-lg px-4 py-2 text-sm font-semibold ${
                  canBuy ? 'bg-sky-500 text-white hover:bg-sky-400' : 'cursor-not-allowed bg-neutral-700 text-neutral-500'
                }`}
              >
                Comprar combustible
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
