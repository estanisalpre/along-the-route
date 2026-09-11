import { AnimatePresence, motion } from 'framer-motion'
import { formatArs } from '../../core/format'
import { LICENSES } from '../../core/license'
import { VEHICLE_CATEGORIES, type VehicleListing } from '../../core/vehicleListing'

interface VehicleDetailModalProps {
  listing: VehicleListing | null
  canAfford: boolean
  onClose: () => void
  onBuy: (listing: VehicleListing) => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-neutral-800 py-2 text-sm last:border-0">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  )
}

export function VehicleDetailModal({ listing, canAfford, onClose, onBuy }: VehicleDetailModalProps) {
  return (
    <AnimatePresence>
      {listing && (
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
                <div className="text-xl font-semibold text-white">
                  {listing.brand} {listing.model}
                </div>
                <div className="text-sm text-neutral-400">
                  {VEHICLE_CATEGORIES[listing.category].name} · {listing.condition === 'nuevo' ? '0km' : 'Usado'}
                </div>
              </div>
              <span className="text-4xl">{VEHICLE_CATEGORIES[listing.category].icon}</span>
            </div>

            <div className="mt-4 rounded-lg bg-neutral-800/60 p-3">
              <Row label="Precio" value={formatArs(listing.price)} />
              <Row label="Estado mecánico" value={`${listing.mechanicalCondition}%`} />
              <Row label="Kilometraje" value={`${listing.mileageKm.toLocaleString('es-AR')} km`} />
              <Row label="Capacidad de carga" value={`${listing.cargoCapacityKg.toLocaleString('es-AR')} kg`} />
              <Row label="Consumo" value={`${listing.fuelConsumptionPer100Km} L / 100km`} />
              <Row label="Tanque" value={`${listing.tankCapacityLiters} L`} />
              <Row
                label="Combustible actual"
                value={`${listing.currentFuelLiters} L (${Math.round((listing.currentFuelLiters / listing.tankCapacityLiters) * 100)}%)`}
              />
              <Row label="Autonomía con tanque lleno" value={`${listing.rangeKm.toLocaleString('es-AR')} km`} />
              <Row label="Velocidad de crucero" value={`${listing.averageSpeedKmh} km/h`} />
              <Row
                label="Licencia requerida"
                value={`${listing.requiredLicense} — ${LICENSES[listing.requiredLicense].description}`}
              />
              <Row
                label="Configuración de ejes"
                value={`${listing.axleConfig === 'simple' ? 'Eje simple' : listing.axleConfig === 'tandem' ? 'Doble eje (tandem)' : 'Articulado'} · ${listing.wheelCount} ruedas`}
              />
              <Row label="Cabina" value={listing.hasSleeperCabin ? 'Con cucheta' : 'Sin cucheta'} />
              <Row label="Mantenimiento" value={`${formatArs(listing.maintenanceCostPerKm)} / km`} />
            </div>

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
                disabled={!canAfford}
                onClick={() => onBuy(listing)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${
                  canAfford ? 'bg-orange-500 text-white hover:bg-orange-400' : 'cursor-not-allowed bg-neutral-700 text-neutral-500'
                }`}
              >
                Comprar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
