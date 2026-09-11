import { motion } from 'framer-motion'
import { useState } from 'react'
import { generateAgencyCandidates, type Driver } from '../../core/driver'
import { formatArs } from '../../core/format'
import type { Vehicle } from '../../core/vehicle'
import { AlertModal } from '../common/AlertModal'
import { HireDriverModal } from './HireDriverModal'

interface HiringAgencyProps {
  vehicles: Vehicle[]
  onHire: (driver: Driver, vehicleId: string) => void
}

export function HiringAgency({ vehicles, onHire }: HiringAgencyProps) {
  const [candidates, setCandidates] = useState<Driver[]>(() => generateAgencyCandidates(6))
  const [selected, setSelected] = useState<Driver | null>(null)
  const [showNoVehiclesAlert, setShowNoVehiclesAlert] = useState(false)

  const unassignedVehicles = vehicles.filter((v) => !v.driverId)

  function handleHireClick(driver: Driver) {
    if (unassignedVehicles.length === 0) {
      setShowNoVehiclesAlert(true)
      return
    }
    setSelected(driver)
  }

  function confirmHire(vehicleId: string) {
    if (!selected) return
    onHire(selected, vehicleId)
    setCandidates((prev) => prev.filter((c) => c.id !== selected.id))
    setSelected(null)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          Un chofer nuevo necesita un vehículo sin asignar. Comprá el vehículo primero en Mercado → Flota.
        </p>
        <button
          type="button"
          onClick={() => setCandidates(generateAgencyCandidates(6))}
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          🔄 Buscar otros candidatos
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {candidates.map((driver, i) => (
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

            <button
              type="button"
              onClick={() => handleHireClick(driver)}
              className="mt-3 w-full rounded bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-400"
            >
              Contratar
            </button>
          </motion.div>
        ))}
      </div>

      <HireDriverModal
        candidate={selected}
        unassignedVehicles={unassignedVehicles}
        onClose={() => setSelected(null)}
        onConfirm={confirmHire}
      />

      <AlertModal
        open={showNoVehiclesAlert}
        title="No hay vehículos disponibles"
        message="Todos tus vehículos ya tienen chofer. Primero comprá un vehículo en Mercado → Flota, y después volvé a contratar."
        onClose={() => setShowNoVehiclesAlert(false)}
      />
    </div>
  )
}
