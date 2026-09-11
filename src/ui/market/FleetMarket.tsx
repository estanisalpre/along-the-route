import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { formatArs } from '../../core/format'
import { generateVehicleMarket, VEHICLE_CATEGORIES, type VehicleListing } from '../../core/vehicleListing'
import { VehicleDetailModal } from './VehicleDetailModal'

interface FleetMarketProps {
  cash: number
  onBuy: (listing: VehicleListing) => void
}

export function FleetMarket({ cash, onBuy }: FleetMarketProps) {
  const [listings] = useState<VehicleListing[]>(() => generateVehicleMarket())
  const [selected, setSelected] = useState<VehicleListing | null>(null)

  const grouped = useMemo(() => {
    const byCategory = new Map<string, VehicleListing[]>()
    for (const listing of listings) {
      const list = byCategory.get(listing.category) ?? []
      list.push(listing)
      byCategory.set(listing.category, list)
    }
    return byCategory
  }, [listings])

  return (
    <div className="space-y-8">
      {Array.from(grouped.entries()).map(([categoryId, categoryListings]) => {
        const category = VEHICLE_CATEGORIES[categoryId as keyof typeof VEHICLE_CATEGORIES]
        return (
          <div key={categoryId}>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xl">{category.icon}</span>
              <h3 className="font-semibold text-white">{category.name}</h3>
              <span className="text-xs text-neutral-500">{category.description}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryListings.map((listing, i) => {
                const canAfford = cash >= listing.price
                return (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-900 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-white">
                          {listing.brand} {listing.model}
                        </div>
                        <span
                          className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            listing.condition === 'nuevo' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {listing.condition === 'nuevo' ? '0KM' : `USADO · ${listing.mechanicalCondition}%`}
                        </span>
                      </div>
                      <span className="text-3xl">{category.icon}</span>
                    </div>

                    <div className="mt-3 flex-1 space-y-1 text-xs text-neutral-400">
                      <div>Carga: {listing.cargoCapacityKg.toLocaleString('es-AR')} kg</div>
                      <div>Consumo: {listing.fuelConsumptionPer100Km} L/100km</div>
                      <div>Licencia: {listing.requiredLicense}</div>
                      {listing.condition === 'usado' && <div>{listing.mileageKm.toLocaleString('es-AR')} km recorridos</div>}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold text-white">{formatArs(listing.price)}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelected(listing)}
                          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                        >
                          Detalles
                        </button>
                        <button
                          type="button"
                          disabled={!canAfford}
                          onClick={() => onBuy(listing)}
                          className={`rounded px-2 py-1 text-xs font-semibold ${
                            canAfford
                              ? 'bg-orange-500 text-white hover:bg-orange-400'
                              : 'cursor-not-allowed bg-neutral-700 text-neutral-500'
                          }`}
                        >
                          Comprar
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )
      })}

      <VehicleDetailModal
        listing={selected}
        canAfford={selected ? cash >= selected.price : false}
        onClose={() => setSelected(null)}
        onBuy={(listing) => {
          onBuy(listing)
          setSelected(null)
        }}
      />
    </div>
  )
}
