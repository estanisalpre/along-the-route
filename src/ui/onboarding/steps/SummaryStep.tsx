import { motion } from 'framer-motion'
import { CITIES } from '../../../core/cities'
import type { Driver } from '../../../core/driver'
import { formatArs } from '../../../core/format'
import { GARAGE_TIERS } from '../../../core/garage'
import { quoteLoan, type LoanOption } from '../../../core/loan'
import { LOGOS } from '../../../core/logos'
import { VEHICLE_CATALOG, type VehicleType } from '../../../core/vehicle'

interface SummaryStepProps {
  ownerName: string
  companyName: string
  logoId: string
  loanOption: LoanOption
  cityId: string
  driver: Driver
  vehicleType: VehicleType
  finalCash: number
}

export function SummaryStep({
  ownerName,
  companyName,
  logoId,
  loanOption,
  cityId,
  driver,
  vehicleType,
  finalCash,
}: SummaryStepProps) {
  const logo = LOGOS.find((l) => l.id === logoId)!
  const city = CITIES.find((c) => c.id === cityId)!
  const garageTier = GARAGE_TIERS[0]
  const vehicleSpec = VEHICLE_CATALOG.find((v) => v.type === vehicleType)!
  const { dailyQuota } = quoteLoan(loanOption)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Todo listo, {ownerName.split(' ')[0] || ownerName}</h2>
        <p className="mt-1 text-sm text-neutral-400">Revisá el resumen antes de arrancar a operar.</p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-4 rounded-xl border border-neutral-700 bg-neutral-800 p-4"
      >
        <div className={`flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br text-2xl ${logo.gradient}`}>
          {logo.emoji}
        </div>
        <div>
          <div className="text-lg font-semibold text-white">{companyName}</div>
          <div className="text-sm text-neutral-400">Fundada por {ownerName}</div>
        </div>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: '🏠 Sede', value: `${garageTier.name} en ${city.name}` },
          { label: '👤 Chofer', value: `${driver.name} — ${formatArs(driver.dailySalary)}/día` },
          { label: '🚚 Vehículo', value: vehicleSpec.name },
          { label: '🏦 Cuota diaria del préstamo', value: formatArs(dailyQuota) },
        ].map((row, i) => (
          <motion.div
            key={row.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06 }}
            className="rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-sm"
          >
            <div className="text-neutral-400">{row.label}</div>
            <div className="mt-0.5 font-medium text-white">{row.value}</div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-center"
      >
        <div className="text-xs text-emerald-300">Efectivo con el que arrancás</div>
        <div className="text-2xl font-bold text-emerald-400">{formatArs(finalCash)}</div>
      </motion.div>
    </div>
  )
}
