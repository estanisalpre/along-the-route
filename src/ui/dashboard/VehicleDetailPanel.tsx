import { motion } from 'framer-motion'
import { CITIES } from '../../core/cities'
import type { Driver } from '../../core/driver'
import { driverAvatarGradient, driverInitials } from '../../core/driverAvatar'
import { formatArs, formatClockTime, formatDuration } from '../../core/format'
import { autonomyKm, effectiveConsumptionPer100Km, LOW_FUEL_LITERS } from '../../core/fuel'
import { computeTripState, type Trip } from '../../core/trip'
import { MIN_CRUISE_SPEED_KMH, type Vehicle } from '../../core/vehicle'

interface VehicleDetailPanelProps {
  vehicle: Vehicle
  trip: Trip | undefined
  driver: Driver | undefined
  now: number
  onClose: () => void
  onSetCruiseSpeed: (cruiseSpeedKmh: number) => void
  onSetRefuelTarget: (refuelTargetLiters: number) => void
}

export function VehicleDetailPanel({
  vehicle,
  trip,
  driver,
  now,
  onClose,
  onSetCruiseSpeed,
  onSetRefuelTarget,
}: VehicleDetailPanelProps) {
  const state = trip ? computeTripState(trip, now) : null
  const origin = trip ? CITIES.find((c) => c.id === trip.route.originCityId) : undefined
  const destination = trip ? CITIES.find((c) => c.id === trip.route.destinationCityId) : undefined
  const parkedCity = !trip ? CITIES.find((c) => c.id === vehicle.currentCityId) : undefined

  // Con la velocidad constante de hoy el viaje nunca puede llegar "atrasado"
  // respecto a lo prometido al salir — esto queda listo para cuando existan
  // eventos que sí puedan demorarlo (tráfico, clima, roturas: ver MECHANICS.md).
  const lateMs = trip && state?.status === 'in_transit' ? Math.max(0, now - trip.estimatedArrivalTimestamp) : 0

  const tankCapacityLiters = vehicle.tankCapacityLiters ?? 0
  const currentFuelLiters = state ? state.fuelLiters : (vehicle.currentFuelLiters ?? 0)
  const lowFuel = currentFuelLiters <= LOW_FUEL_LITERS

  const cruiseSpeedKmh = vehicle.cruiseSpeedKmh ?? vehicle.averageSpeedKmh
  const refuelTargetLiters = vehicle.refuelTargetLiters ?? tankCapacityLiters
  const canEditSettings = !trip // el viaje en curso ya salió con su plan fijo — ver core/fuelPlan.ts
  const consumptionAtCruiseSpeed =
    vehicle.fuelConsumptionPer100Km !== undefined
      ? effectiveConsumptionPer100Km(vehicle.fuelConsumptionPer100Km, cruiseSpeedKmh, vehicle.averageSpeedKmh)
      : undefined
  const autonomyAtCruiseSpeedKm =
    consumptionAtCruiseSpeed !== undefined ? autonomyKm(tankCapacityLiters, consumptionAtCruiseSpeed) : undefined

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      className="w-80 rounded-xl border border-neutral-700 bg-neutral-900/95 p-4 shadow-2xl backdrop-blur-sm"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-white">{vehicle.brand ? `${vehicle.brand} ${vehicle.model}` : vehicle.type}</div>
          <div className="text-xs text-neutral-500">{vehicle.status === 'in_transit' ? 'En ruta' : 'Disponible'}</div>
        </div>
        <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
          ✕
        </button>
      </div>

      {driver && (
        <div className="mt-3 flex items-center gap-2 border-t border-neutral-800 pt-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white ${driverAvatarGradient(driver.id)}`}
          >
            {driverInitials(driver.name)}
          </div>
          <div className="text-xs">
            <div className="text-white">{driver.name}</div>
            <div className="text-neutral-500">{driver.experienceYears} años de experiencia</div>
          </div>
        </div>
      )}

      {trip && state && origin && destination ? (
        <div className="mt-3 space-y-2 border-t border-neutral-800 pt-3 text-xs">
          <div className="font-medium text-white">
            {origin.name} → {destination.name}
          </div>
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-orange-500" style={{ width: `${state.progress * 100}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-neutral-400">
              <span>{state.distanceTravelledKm.toFixed(0)} km recorridos</span>
              <span>{state.remainingKm.toFixed(0)} km restantes</span>
            </div>
          </div>

          {state.status === 'refueling' && (
            <div className="rounded border border-blue-500/40 bg-blue-500/10 p-2">
              <div className="flex justify-between text-blue-300">
                <span>⛽ Repostando...</span>
                <span>{((state.refuelProgress ?? 0) * 100).toFixed(0)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full bg-blue-400 transition-[width]"
                  style={{ width: `${(state.refuelProgress ?? 0) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-neutral-400">
            <div>
              <div className="text-neutral-500">Llegada estimada</div>
              <div className="text-white">
                {Number.isFinite(trip.estimatedArrivalTimestamp) ? formatClockTime(trip.estimatedArrivalTimestamp) : '—'}
              </div>
            </div>
            <div>
              <div className="text-neutral-500">Tiempo restante</div>
              <div className="text-white">{state.status === 'arrived' ? 'Llegó' : formatDuration((state.remainingKm / trip.averageSpeedKmh) * 3_600_000)}</div>
            </div>
          </div>

          {state.status !== 'refueling' && (
            <div className={`rounded px-2 py-1 text-center font-medium ${lateMs > 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
              {lateMs > 0 ? `Atrasado ${formatDuration(lateMs)}` : 'En horario'}
            </div>
          )}

          <div className="flex justify-between text-neutral-400">
            <span>Ganancia del viaje</span>
            <span className="text-white">{formatArs(trip.payout)}</span>
          </div>
        </div>
      ) : (
        parkedCity && (
          <div className="mt-3 border-t border-neutral-800 pt-3 text-xs text-neutral-400">
            Esperando carga en <span className="text-white">{parkedCity.name}</span>
          </div>
        )
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-800 pt-3 text-xs">
        <div>
          <div className="text-neutral-500">Combustible</div>
          <div className={lowFuel ? 'font-semibold text-red-400' : 'text-white'}>
            {tankCapacityLiters ? `${currentFuelLiters.toFixed(0)} / ${tankCapacityLiters} L` : 'N/D'}
          </div>
        </div>
        <div>
          <div className="text-neutral-500">Estado mecánico</div>
          <div className="text-white">
            {vehicle.mechanicalCondition !== undefined ? `${vehicle.mechanicalCondition}%` : 'N/D'}
          </div>
        </div>
      </div>
      {lowFuel && (
        <div className="mt-2 rounded bg-red-500/20 px-2 py-1 text-center text-xs font-medium text-red-400">
          ⚠️ Combustible bajo
        </div>
      )}

      {tankCapacityLiters > 0 && (
        <div className="mt-3 space-y-3 border-t border-neutral-800 pt-3 text-xs">
          <div>
            <div className="mb-1 flex justify-between text-neutral-400">
              <span>Velocidad de crucero</span>
              <span className="text-white">{cruiseSpeedKmh} km/h</span>
            </div>
            <input
              type="range"
              min={MIN_CRUISE_SPEED_KMH}
              max={vehicle.averageSpeedKmh}
              step={5}
              value={cruiseSpeedKmh}
              disabled={!canEditSettings}
              onChange={(e) => onSetCruiseSpeed(Number(e.target.value))}
              className="w-full accent-orange-500 disabled:opacity-40"
            />
            {autonomyAtCruiseSpeedKm !== undefined && (
              <div className="mt-1 text-neutral-500">
                Autonomía a tanque lleno: ~{autonomyAtCruiseSpeedKm.toFixed(0)} km
              </div>
            )}
            {!canEditSettings && <div className="mt-1 text-neutral-600">Se aplica recién en el próximo viaje.</div>}
          </div>

          <div>
            <div className="mb-1 flex justify-between text-neutral-400">
              <span>Repostar hasta</span>
              <span className="text-white">{refuelTargetLiters} L</span>
            </div>
            <input
              type="range"
              min={0}
              max={tankCapacityLiters}
              step={5}
              value={refuelTargetLiters}
              disabled={!canEditSettings}
              onChange={(e) => onSetRefuelTarget(Number(e.target.value))}
              className="w-full accent-orange-500 disabled:opacity-40"
            />
            {refuelTargetLiters === 0 && (
              <div className="mt-1 text-red-400">No va a cargar nada al parar — riesgo de quedarse sin combustible.</div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
