import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { CITIES } from '../../core/cities'
import type { Driver } from '../../core/driver'
import { formatArs } from '../../core/format'
import { settleTrip } from '../../core/economy'
import { LOW_FUEL_LITERS } from '../../core/fuel'
import { computeTripState, type Trip } from '../../core/trip'
import type { Vehicle } from '../../core/vehicle'

type Tab = 'viajes' | 'esperando'

interface FleetPanelProps {
  vehicles: Vehicle[]
  trips: Trip[]
  drivers: Driver[]
  now: number
  selectedVehicleId: string | null
  onSelectVehicle: (vehicleId: string) => void
  onCenterVehicle: (vehicleId: string) => void
  onCollectTrip: (trip: Trip) => void
}

function vehicleName(vehicle: Vehicle): string {
  return vehicle.brand ? `${vehicle.brand} ${vehicle.model}` : vehicle.type
}

function CenterButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-orange-500 hover:text-orange-400"
    >
      ⌖ Centrar
    </button>
  )
}

export function FleetPanel({
  vehicles,
  trips,
  drivers,
  now,
  selectedVehicleId,
  onSelectVehicle,
  onCenterVehicle,
  onCollectTrip,
}: FleetPanelProps) {
  const [tab, setTab] = useState<Tab>('viajes')
  const waitingVehicles = vehicles.filter((v) => !trips.some((t) => t.vehicleId === v.id))

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex gap-1 border-b border-neutral-800">
        {(
          [
            { id: 'viajes' as const, label: `🚚 Viajes (${trips.length})` },
            { id: 'esperando' as const, label: `Esperando carga (${waitingVehicles.length})` },
          ]
        ).map((t) => {
          const isActive = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative px-2 pb-2 text-xs font-medium transition-colors ${
                isActive ? 'text-orange-500' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {t.label}
              {isActive && (
                <motion.div layoutId="fleet-panel-underline" className="absolute inset-x-0 -bottom-px h-0.5 bg-orange-500" />
              )}
            </button>
          )
        })}
      </div>

      {tab === 'viajes' && (
        <>
          {trips.length === 0 && <p className="text-xs text-neutral-500">No tenés viajes activos. Aceptá una carga.</p>}
          <div className="space-y-2">
            <AnimatePresence>
              {trips.map((trip) => {
                const state = computeTripState(trip, now)
                const origin = CITIES.find((c) => c.id === trip.route.originCityId)!
                const destination = CITIES.find((c) => c.id === trip.route.destinationCityId)!
                const isSelected = trip.vehicleId === selectedVehicleId

                if (state.status === 'arrived') {
                  const fuelCost = trip.fuelStops.reduce((sum, s) => sum + s.cost, 0)
                  const settlement = settleTrip(trip.route.distanceTotalKm, trip.payout, fuelCost)
                  return (
                    <motion.div
                      key={trip.id}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      onClick={() => onSelectVehicle(trip.vehicleId)}
                      className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${
                        isSelected ? 'border-orange-500/70 bg-emerald-500/10' : 'border-emerald-500/40 bg-emerald-500/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-white">
                          🏁 {origin.name} → {destination.name}
                        </div>
                        <CenterButton onClick={() => onCenterVehicle(trip.vehicleId)} />
                      </div>
                      <div className="mt-1 text-xs text-neutral-400">
                        Ingreso {formatArs(settlement.payout)} · Gastos{' '}
                        {formatArs(settlement.fuelCost + settlement.tollCost + settlement.maintenanceCost)}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-emerald-400">
                        Ganancia: {formatArs(settlement.netProfit)}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onCollectTrip(trip)
                        }}
                        className="mt-2 w-full rounded bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
                      >
                        Cobrar
                      </button>
                    </motion.div>
                  )
                }

                const etaMinutes = (state.remainingKm / trip.averageSpeedKmh) * 60
                const lowFuel = state.fuelLiters <= LOW_FUEL_LITERS
                return (
                  <motion.div
                    key={trip.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => onSelectVehicle(trip.vehicleId)}
                    className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${
                      lowFuel
                        ? 'border-red-500/70 bg-red-500/10'
                        : isSelected
                          ? 'border-orange-500/70 bg-neutral-800/60'
                          : 'border-neutral-800 bg-neutral-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-white">
                        {origin.name} → {destination.name}
                      </div>
                      <CenterButton onClick={() => onCenterVehicle(trip.vehicleId)} />
                    </div>
                    {state.status === 'refueling' ? (
                      <div className="mt-1 text-xs text-blue-400">⛽ Repostando ({((state.refuelProgress ?? 0) * 100).toFixed(0)}%)</div>
                    ) : (
                      <>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
                          <motion.div
                            className="h-full bg-orange-500"
                            animate={{ width: `${state.progress * 100}%` }}
                            transition={{ ease: 'linear', duration: 0.9 }}
                          />
                        </div>
                        <div className="mt-1 flex justify-between text-xs text-neutral-500">
                          <span>{(state.progress * 100).toFixed(0)}%</span>
                          <span>llega en ~{etaMinutes.toFixed(0)} min</span>
                        </div>
                      </>
                    )}
                    {lowFuel && <div className="mt-1 text-xs font-medium text-red-400">⚠️ Combustible bajo</div>}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      {tab === 'esperando' && (
        <>
          {waitingVehicles.length === 0 && (
            <p className="text-xs text-neutral-500">Todos tus vehículos están en ruta.</p>
          )}
          <div className="space-y-2">
            <AnimatePresence>
              {waitingVehicles.map((vehicle) => {
                const city = CITIES.find((c) => c.id === vehicle.currentCityId)
                const driver = drivers.find((d) => d.id === vehicle.driverId)
                const isSelected = vehicle.id === selectedVehicleId
                return (
                  <motion.div
                    key={vehicle.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    onClick={() => onSelectVehicle(vehicle.id)}
                    className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${
                      isSelected ? 'border-orange-500/70 bg-neutral-800/60' : 'border-neutral-800 bg-neutral-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-white">{vehicleName(vehicle)}</div>
                      <CenterButton onClick={() => onCenterVehicle(vehicle.id)} />
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      En {city?.name ?? 'ubicación desconocida'} · {driver ? driver.name : 'Sin chofer asignado'}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}
