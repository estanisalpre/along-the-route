import { useState } from 'react'
import type { Driver } from '../../core/driver'
import type { Vehicle } from '../../core/vehicle'
import { EmployeeList } from '../staff/EmployeeList'
import { HiringAgency } from '../staff/HiringAgency'

type PersonalTab = 'empleados' | 'agencia'

interface PersonalViewProps {
  drivers: Driver[]
  vehicles: Vehicle[]
  onHire: (driver: Driver, vehicleId: string) => void
}

export function PersonalView({ drivers, vehicles, onHire }: PersonalViewProps) {
  const [tab, setTab] = useState<PersonalTab>('empleados')

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('empleados')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === 'empleados' ? 'bg-orange-500 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          Mis empleados
        </button>
        <button
          type="button"
          onClick={() => setTab('agencia')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === 'agencia' ? 'bg-orange-500 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          Agencia
        </button>
      </div>

      {tab === 'empleados' && <EmployeeList drivers={drivers} vehicles={vehicles} />}
      {tab === 'agencia' && <HiringAgency vehicles={vehicles} onHire={onHire} />}
    </div>
  )
}
