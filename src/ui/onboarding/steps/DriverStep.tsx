import { motion } from 'framer-motion'
import type { Driver } from '../../../core/driver'
import { formatArs } from '../../../core/format'

interface DriverStepProps {
  candidates: Driver[]
  selectedDriverId: string | null
  onSelect: (driverId: string) => void
}

export function DriverStep({ candidates, selectedDriverId, onSelect }: DriverStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Contratá a tu primer chofer</h2>
        <p className="mt-1 text-sm text-neutral-400">Se les paga un sueldo diario, viajen o no.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {candidates.map((driver, i) => {
          const selected = selectedDriverId === driver.id
          return (
            <motion.button
              key={driver.id}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ y: -3 }}
              onClick={() => onSelect(driver.id)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                selected
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-neutral-700 bg-neutral-800 hover:border-neutral-500'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-700 text-lg">
                  👤
                </div>
                <div>
                  <div className="font-semibold text-white">{driver.name}</div>
                  <div className="text-xs text-neutral-400">{driver.experienceYears} años de experiencia</div>
                </div>
              </div>
              <div className="mt-3 text-sm font-medium text-orange-400">
                {formatArs(driver.dailySalary)} / día
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
