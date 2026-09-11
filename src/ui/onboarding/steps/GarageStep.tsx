import { motion } from 'framer-motion'
import { CITIES } from '../../../core/cities'
import { formatArs } from '../../../core/format'
import { GARAGE_TIERS } from '../../../core/garage'
import { CityPicker } from '../CityPicker'

export interface GarageDraft {
  cityId: string | null
}

interface GarageStepProps {
  draft: GarageDraft
  onChange: (draft: GarageDraft) => void
}

export function GarageStep({ draft, onChange }: GarageStepProps) {
  const selectedCity = CITIES.find((c) => c.id === draft.cityId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Elegí tu sede</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Arrancás con un garage pequeño. Los más grandes se desbloquean más adelante.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {GARAGE_TIERS.map((tier) => {
          const locked = tier.lockedReason !== null
          return (
            <div
              key={tier.id}
              className={`relative overflow-hidden rounded-xl border p-4 ${
                locked
                  ? 'border-neutral-800 bg-neutral-900/60 opacity-60'
                  : 'border-orange-500 bg-orange-500/10'
              }`}
            >
              {locked && (
                <div className="absolute top-2 right-2 text-lg" title={tier.lockedReason ?? ''}>
                  🔒
                </div>
              )}
              <div className="text-lg font-semibold text-white">{tier.name}</div>
              <div className="mt-2 space-y-1 text-xs text-neutral-400">
                <div>Capacidad: {tier.vehicleCapacity} vehículos</div>
                <div>Tanque: {tier.fuelTankCapacityLiters.toLocaleString('es-AR')} L</div>
                <div className="text-neutral-300">Costo: {formatArs(tier.cost)}</div>
              </div>
              {locked && <div className="mt-2 text-xs text-neutral-500">{tier.lockedReason}</div>}
            </div>
          )
        })}
      </div>

      <div>
        <span className="mb-2 block text-sm text-neutral-300">
          ¿Dónde querés instalar tu garage? Buscá tu ciudad o elegila en el mapa.
        </span>
        <CityPicker selectedCityId={draft.cityId} onSelect={(cityId) => onChange({ cityId })} />
      </div>

      {selectedCity && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-200"
        >
          Sede elegida: <span className="font-semibold">{selectedCity.name}</span>, {selectedCity.province}
        </motion.div>
      )}
    </div>
  )
}
