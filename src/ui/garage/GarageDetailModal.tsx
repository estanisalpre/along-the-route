import { AnimatePresence, motion } from 'framer-motion'
import { CITIES } from '../../core/cities'
import { GARAGE_TIERS, type Garage } from '../../core/garage'
import type { Vehicle } from '../../core/vehicle'

interface GarageDetailModalProps {
  garage: Garage | null
  vehicles: Vehicle[]
  onClose: () => void
  onBuyFuel: (garageId: string) => void
}

export function GarageDetailModal({ garage, vehicles, onClose, onBuyFuel }: GarageDetailModalProps) {
  const tier = garage ? GARAGE_TIERS.find((t) => t.id === garage.tierId)! : null
  const city = garage ? CITIES.find((c) => c.id === garage.cityId)! : null
  const vehiclesHere = garage ? vehicles.filter((v) => v.currentCityId === garage.cityId) : []

  return (
    <AnimatePresence>
      {garage && tier && city && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xl font-semibold text-white">{tier.name}</div>
                <div className="text-sm text-neutral-400">
                  {city.name}, {city.province}
                </div>
              </div>
              <span className="text-4xl">🏠</span>
            </div>

            <div className="mt-4 space-y-3 rounded-lg bg-neutral-800/60 p-3">
              <div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Vehículos</span>
                  <span className="text-white">
                    {vehiclesHere.length} / {tier.vehicleCapacity}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
                  <div
                    className="h-full bg-orange-500"
                    style={{ width: `${Math.min(100, (vehiclesHere.length / tier.vehicleCapacity) * 100)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Combustible</span>
                  <span className="text-white">
                    {garage.fuelLiters.toLocaleString('es-AR')} / {tier.fuelTankCapacityLiters.toLocaleString('es-AR')} L
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
                  <div
                    className="h-full bg-sky-500"
                    style={{ width: `${Math.min(100, (garage.fuelLiters / tier.fuelTankCapacityLiters) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {vehiclesHere.length > 0 && (
              <div className="mt-4 space-y-1 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
                {vehiclesHere.map((v) => (
                  <div key={v.id}>
                    🚚 {v.brand ? `${v.brand} ${v.model}` : v.type} — {v.status === 'available' ? 'disponible' : 'en ruta'}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => onBuyFuel(garage.id)}
                className="flex-1 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
              >
                Comprar combustible
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
