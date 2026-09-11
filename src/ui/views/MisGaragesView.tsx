import { motion } from 'framer-motion'
import { useState } from 'react'
import { CITIES } from '../../core/cities'
import { GARAGE_TIERS, type Garage } from '../../core/garage'
import type { Vehicle } from '../../core/vehicle'
import { GarageDetailModal } from '../garage/GarageDetailModal'

interface MisGaragesViewProps {
  garages: Garage[]
  vehicles: Vehicle[]
  onBuyFuel: (garageId: string) => void
}

export function MisGaragesView({ garages, vehicles, onBuyFuel }: MisGaragesViewProps) {
  const [selectedGarageId, setSelectedGarageId] = useState<string | null>(null)
  const selectedGarage = garages.find((g) => g.id === selectedGarageId) ?? null

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <h2 className="mb-1 text-xl font-semibold text-white">Mis garages</h2>
      <p className="mb-6 text-sm text-neutral-400">Cada sede tiene su propia capacidad de vehículos y tanque de combustible.</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {garages.map((garage, i) => {
          const tier = GARAGE_TIERS.find((t) => t.id === garage.tierId)!
          const city = CITIES.find((c) => c.id === garage.cityId)!
          const vehiclesHere = vehicles.filter((v) => v.currentCityId === garage.cityId)

          return (
            <motion.button
              key={garage.id}
              type="button"
              onClick={() => setSelectedGarageId(garage.id)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ y: -2 }}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left hover:border-neutral-600"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">{tier.name}</div>
                  <div className="text-sm text-neutral-400">
                    {city.name}, {city.province}
                  </div>
                </div>
                <span className="text-2xl">🏠</span>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-neutral-400">
                  <span>Vehículos</span>
                  <span className="text-white">
                    {vehiclesHere.length} / {tier.vehicleCapacity}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full bg-orange-500"
                    style={{ width: `${Math.min(100, (vehiclesHere.length / tier.vehicleCapacity) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Combustible</span>
                  <span className="text-white">
                    {garage.fuelLiters.toLocaleString('es-AR')} / {tier.fuelTankCapacityLiters.toLocaleString('es-AR')} L
                  </span>
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>

      {garages.length === 0 && <p className="text-sm text-neutral-500">Todavía no tenés ningún garage.</p>}

      <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-400">
        ¿Necesitás una sede nueva? Andá a <span className="text-neutral-200">Expansión → Garages</span> para comprar en otra ciudad.
      </div>

      <GarageDetailModal
        garage={selectedGarage}
        vehicles={vehicles}
        onClose={() => setSelectedGarageId(null)}
        onBuyFuel={(garageId) => {
          setSelectedGarageId(null)
          onBuyFuel(garageId)
        }}
      />
    </div>
  )
}
