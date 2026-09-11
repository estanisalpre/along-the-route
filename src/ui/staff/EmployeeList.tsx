import { motion } from 'framer-motion'
import { formatArs } from '../../core/format'
import type { Driver } from '../../core/driver'
import type { Vehicle } from '../../core/vehicle'

interface EmployeeListProps {
  drivers: Driver[]
  vehicles: Vehicle[]
}

export function EmployeeList({ drivers, vehicles }: EmployeeListProps) {
  if (drivers.length === 0) {
    return <p className="text-sm text-neutral-500">Todavía no tenés ningún chofer contratado.</p>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {drivers.map((driver, i) => {
        const vehicle = vehicles.find((v) => v.driverId === driver.id)
        return (
          <motion.div
            key={driver.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-700 text-lg">👤</div>
              <div>
                <div className="font-semibold text-white">{driver.name}</div>
                <div className="text-xs text-neutral-400">{driver.experienceYears} años de experiencia</div>
              </div>
            </div>

            <div className="mt-3 text-sm font-medium text-orange-400">{formatArs(driver.dailySalary)} / día</div>

            <div className="mt-2 flex flex-wrap gap-1">
              {driver.licenses.map((license) => (
                <span key={license} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">
                  {license}
                </span>
              ))}
            </div>

            <div className="mt-3 border-t border-neutral-800 pt-2 text-xs text-neutral-500">
              {vehicle ? (
                <>🚚 Maneja: {vehicle.brand ? `${vehicle.brand} ${vehicle.model}` : vehicle.type}</>
              ) : (
                <span className="text-amber-500">Sin vehículo asignado</span>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
