import { motion } from 'framer-motion'
import { formatArs } from '../../../core/format'
import { VEHICLE_CATALOG, type VehicleType } from '../../../core/vehicle'

interface VehicleStepProps {
  selectedType: VehicleType | null
  onSelect: (type: VehicleType) => void
}

export function VehicleStep({ selectedType, onSelect }: VehicleStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Elegí tu primer vehículo</h2>
        <p className="mt-1 text-sm text-neutral-400">Ninguno es "el mejor" — cada uno tiene su propio equilibrio.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {VEHICLE_CATALOG.map((spec, i) => {
          const selected = selectedType === spec.type
          return (
            <motion.button
              key={spec.type}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ y: -3 }}
              onClick={() => onSelect(spec.type)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                selected
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-neutral-700 bg-neutral-800 hover:border-neutral-500'
              }`}
            >
              <div className="text-3xl">🚚</div>
              <div className="mt-2 font-semibold text-white">{spec.name}</div>
              <div className="mt-1 text-xs text-neutral-400">{spec.description}</div>
              <dl className="mt-3 space-y-1 text-xs text-neutral-300">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Precio</dt>
                  <dd>{formatArs(spec.purchaseCost)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Velocidad máxima</dt>
                  <dd>{spec.averageSpeedKmh} km/h</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Carga máxima</dt>
                  <dd>{spec.capacityKg.toLocaleString('es-AR')} kg</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Vida útil</dt>
                  <dd>{spec.maintenanceIntervalKm.toLocaleString('es-AR')} km</dd>
                </div>
              </dl>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
