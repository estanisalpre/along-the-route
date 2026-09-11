import { AnimatePresence, motion } from 'framer-motion'
import { CITIES } from '../../core/cities'
import { formatArs } from '../../core/format'
import type { Driver } from '../../core/driver'
import type { Vehicle } from '../../core/vehicle'

interface HireDriverModalProps {
  candidate: Driver | null
  unassignedVehicles: Vehicle[]
  onClose: () => void
  onConfirm: (vehicleId: string) => void
}

export function HireDriverModal({ candidate, unassignedVehicles, onClose, onConfirm }: HireDriverModalProps) {
  return (
    <AnimatePresence>
      {candidate && (
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
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
          >
            <div className="text-lg font-semibold text-white">¿Qué vehículo va a manejar {candidate.name}?</div>
            <p className="mt-1 text-sm text-neutral-400">
              Sueldo: {formatArs(candidate.dailySalary)}/día · {candidate.experienceYears} años de experiencia
            </p>

            <div className="mt-4 space-y-2">
              {unassignedVehicles.map((vehicle) => {
                const city = CITIES.find((c) => c.id === vehicle.currentCityId)
                return (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => onConfirm(vehicle.id)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-left text-sm hover:border-orange-500"
                  >
                    <div className="font-medium text-white">
                      {vehicle.brand ? `${vehicle.brand} ${vehicle.model}` : vehicle.type}
                    </div>
                    <div className="text-xs text-neutral-400">{city?.name}</div>
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Cancelar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
