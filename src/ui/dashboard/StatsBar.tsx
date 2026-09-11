import { motion } from 'framer-motion'
import { formatArs } from '../../core/format'
import { LOGOS } from '../../core/logos'
import type { Company } from '../../core/company'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-neutral-400">{label}</div>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-mono text-lg font-semibold text-white"
      >
        {value}
      </motion.div>
    </div>
  )
}

export function StatsBar({ company }: { company: Company }) {
  const logo = LOGOS.find((l) => l.id === company.logoId)
  const fleetSize = company.vehicles.length
  const inTransit = company.trips.length
  const available = fleetSize - inTransit

  return (
    <div className="flex items-center gap-8 border-b border-neutral-800 bg-neutral-900 px-6 py-3">
      <div className="flex items-center gap-2">
        {logo && (
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-sm ${logo.gradient}`}>
            {logo.emoji}
          </div>
        )}
        <span className="font-semibold text-white">{company.companyName}</span>
      </div>
      <div className="h-8 w-px bg-neutral-800" />
      <Stat label="Dinero" value={formatArs(company.cash)} />
      <Stat label="Flota" value={fleetSize} />
      <Stat label="En ruta" value={inTransit} />
      <Stat label="Disponibles" value={available} />
    </div>
  )
}
