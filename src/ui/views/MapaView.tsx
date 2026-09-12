import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import type { Driver } from '../../core/driver'
import type { FuelPriceEntry } from '../../core/fuelPrice'
import { GAS_STATIONS } from '../../core/gasStation'
import type { Trip } from '../../core/trip'
import type { Vehicle } from '../../core/vehicle'
import { DashboardMap, type FocusGasStationRequest, type FocusVehicleRequest } from '../dashboard/DashboardMap'
import { FleetPanel } from '../dashboard/FleetPanel'
import { GasStationPanel } from '../dashboard/GasStationPanel'
import { MapOptionsMenu } from '../dashboard/MapOptionsMenu'
import { VehicleDetailPanel } from '../dashboard/VehicleDetailPanel'

interface MapaViewProps {
  vehicles: Vehicle[]
  trips: Trip[]
  drivers: Driver[]
  fuelPriceHistory: FuelPriceEntry[]
  now: number
  onCollectTrip: (trip: Trip) => void
  onSetCruiseSpeed: (vehicleId: string, cruiseSpeedKmh: number) => void
  onSetRefuelTarget: (vehicleId: string, refuelTargetLiters: number) => void
  onAdjustFuel: (vehicleId: string, deltaLiters: number) => void
  onCancelFuelStop: (vehicleId: string) => void
  onCallTowTruck: (vehicleId: string) => void
}

export function MapaView({
  vehicles,
  trips,
  drivers,
  fuelPriceHistory,
  now,
  onCollectTrip,
  onSetCruiseSpeed,
  onSetRefuelTarget,
  onAdjustFuel,
  onCancelFuelStop,
  onCallTowTruck,
}: MapaViewProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<FocusVehicleRequest | null>(null)
  const [selectedGasStationId, setSelectedGasStationId] = useState<string | null>(null)
  const [gasStationFocusRequest, setGasStationFocusRequest] = useState<FocusGasStationRequest | null>(null)
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId)
  const selectedGasStation = GAS_STATIONS.find((s) => s.id === selectedGasStationId)

  function centerOnVehicle(vehicleId: string) {
    setSelectedGasStationId(null)
    setSelectedVehicleId(vehicleId)
    setFocusRequest({ vehicleId, nonce: Date.now() })
  }

  function selectVehicle(vehicleId: string | null) {
    setSelectedGasStationId(null)
    setSelectedVehicleId(vehicleId)
  }

  function selectGasStation(gasStationId: string) {
    setSelectedVehicleId(null)
    setSelectedGasStationId(gasStationId)
  }

  function centerOnGasStation() {
    if (!selectedGasStation) return
    setGasStationFocusRequest({ lat: selectedGasStation.lat, lon: selectedGasStation.lon, nonce: Date.now() })
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 p-4">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-neutral-800">
        <DashboardMap
          vehicles={vehicles}
          trips={trips}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={selectVehicle}
          onSelectGasStation={selectGasStation}
          focusRequest={focusRequest}
          gasStationFocusRequest={gasStationFocusRequest}
        />
        <MapOptionsMenu />
        <div className="pointer-events-none absolute bottom-8 right-4">
          <AnimatePresence>
            {selectedVehicle && (
              <div className="pointer-events-auto">
                <VehicleDetailPanel
                  vehicle={selectedVehicle}
                  trip={trips.find((t) => t.vehicleId === selectedVehicle.id)}
                  driver={drivers.find((d) => d.id === selectedVehicle.driverId)}
                  now={now}
                  onClose={() => setSelectedVehicleId(null)}
                  onSetCruiseSpeed={(kmh) => onSetCruiseSpeed(selectedVehicle.id, kmh)}
                  onSetRefuelTarget={(liters) => onSetRefuelTarget(selectedVehicle.id, liters)}
                  onAdjustFuel={(delta) => onAdjustFuel(selectedVehicle.id, delta)}
                  onCancelFuelStop={() => onCancelFuelStop(selectedVehicle.id)}
                  onCallTowTruck={() => onCallTowTruck(selectedVehicle.id)}
                />
              </div>
            )}
            {selectedGasStation && (
              <div className="pointer-events-auto">
                <GasStationPanel
                  gasStation={selectedGasStation}
                  fuelPriceHistory={fuelPriceHistory}
                  onCenter={centerOnGasStation}
                  onClose={() => setSelectedGasStationId(null)}
                />
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto">
        <FleetPanel
          vehicles={vehicles}
          trips={trips}
          drivers={drivers}
          now={now}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={selectVehicle}
          onCenterVehicle={centerOnVehicle}
          onCollectTrip={onCollectTrip}
        />
      </div>
    </div>
  )
}
