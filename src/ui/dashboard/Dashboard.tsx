import { useEffect, useState } from 'react'
import { buildCargoOffer, type Cargo } from '../../core/cargo'
import { cargoMarketCycleIndex, cargoMarketExpiresAt, pickCargoMarketPairs } from '../../core/cargoMarket'
import { CITIES } from '../../core/cities'
import { clearCompany, saveCompany, type Company } from '../../core/company'
import type { Driver } from '../../core/driver'
import { settleTrip } from '../../core/economy'
import { effectiveConsumptionPer100Km } from '../../core/fuel'
import { planFuelStops, scheduleFuelStops } from '../../core/fuelPlan'
import { ensureFuelPriceHistory } from '../../core/fuelPrice'
import { GARAGE_TIERS } from '../../core/garage'
import { GAS_STATIONS, getGasStationPrice } from '../../core/gasStation'
import { computeTripState, estimateArrivalWithStops, type Trip } from '../../core/trip'
import type { Vehicle, VehicleType } from '../../core/vehicle'
import type { VehicleListing } from '../../core/vehicleListing'
import { getCachedRoute } from '../../map/routing/routeCache'
import { NavBar, type MainView } from '../layout/NavBar'
import { ExpansionView } from '../views/ExpansionView'
import { MapaView } from '../views/MapaView'
import { MercadoView } from '../views/MercadoView'
import { MisGaragesView } from '../views/MisGaragesView'
import { PersonalView } from '../views/PersonalView'
import { StatsBar } from './StatsBar'

interface DashboardProps {
  initialCompany: Company
}

const CATEGORY_TO_LEGACY_TYPE: Record<VehicleListing['category'], VehicleType> = {
  mini_furgon: 'utilitario',
  furgon: 'camioneta',
  furgon_grande: 'camion',
  camion_mediano: 'camion',
  camion_grande: 'camion',
  camion_articulado: 'camion',
}

export function Dashboard({ initialCompany }: DashboardProps) {
  const [company, setCompany] = useState(initialCompany)
  const [view, setView] = useState<MainView>('mapa')
  const [now, setNow] = useState(Date.now())
  const [cargoOffers, setCargoOffers] = useState<Cargo[]>([])
  const [loadingCargo, setLoadingCargo] = useState(false)
  const [fuelPurchaseGarageId, setFuelPurchaseGarageId] = useState<string | null>(null)

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    saveCompany(company)
  }, [company])

  // Cada parada a repostar ya agendada (ver core/fuelPlan.ts) se paga sola en
  // cuanto el vehículo la alcanza — no hace falta que el jugador esté mirando
  // el mapa en ese instante. El flag `paid` evita cobrarla dos veces.
  useEffect(() => {
    setCompany((prev) => {
      let cash = prev.cash
      let changedAny = false
      const trips = prev.trips.map((trip) => {
        let changed = false
        const fuelStops = trip.fuelStops.map((stop) => {
          if (stop.paid || now < stop.arrivalTimestamp) return stop
          cash -= stop.cost
          changed = true
          return { ...stop, paid: true }
        })
        if (!changed) return trip
        changedAny = true
        return { ...trip, fuelStops }
      })
      return changedAny ? { ...prev, cash, trips } : prev
    })
  }, [now])

  // El precio del combustible depende del reloj real, no de si el juego está
  // abierto — cada vez que avanza la hora real, se extiende la caminata
  // aleatoria determinista (ver core/fuelPrice.ts) en vez de generar un precio
  // nuevo al azar cada vez.
  useEffect(() => {
    setCompany((prev) => {
      const extended = ensureFuelPriceHistory(prev.fuelPriceHistory, now, prev.createdAt)
      const prevLastHour = prev.fuelPriceHistory[prev.fuelPriceHistory.length - 1]?.hourTimestamp
      const nextLastHour = extended[extended.length - 1]?.hourTimestamp
      if (prevLastHour === nextLastHour) return prev
      return { ...prev, fuelPriceHistory: extended }
    })
  }, [now])

  // El mercado de cargas ya NO depende de tener un vehículo libre en algún
  // lado — es un lote fijo de ofertas que se renueva completo cada 6 horas
  // reales (ver core/cargoMarket.ts), igual para cualquiera que juegue en
  // simultáneo. Analizar la flota para ver qué te falta (chofer, capacidad,
  // range) es decisión del jugador — el mercado no debería ocultar nada por
  // eso.
  const cargoMarketCycle = cargoMarketCycleIndex(now)

  useEffect(() => {
    let cancelled = false
    setLoadingCargo(true)

    async function run() {
      const pairs = pickCargoMarketPairs(cargoMarketCycle, CITIES)
      const expiresAt = cargoMarketExpiresAt(cargoMarketCycle)
      const offers: Cargo[] = []

      // De a tandas chicas para no saturar el servidor de ruteo gratuito
      // (ver src/map/routing/osrmProvider.ts) con 24 pedidos a la vez.
      const CONCURRENCY = 6
      for (let i = 0; i < pairs.length; i += CONCURRENCY) {
        if (cancelled) return
        const batch = pairs.slice(i, i + CONCURRENCY)
        const results = await Promise.allSettled(
          batch.map(async ([origin, destination], j) => {
            const route = await getCachedRoute(origin, destination)
            return buildCargoOffer(origin, destination, route.distanceTotalKm, cargoMarketCycle * 1000 + i + j, expiresAt)
          }),
        )
        for (const result of results) {
          if (result.status === 'fulfilled') offers.push(result.value)
          else console.error('No se pudo generar oferta de carga', result.reason)
        }
      }

      if (!cancelled) {
        setCargoOffers(offers)
        setLoadingCargo(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [cargoMarketCycle])

  async function acceptCargo(cargo: Cargo) {
    const vehicle = company.vehicles.find(
      (v) =>
        v.status === 'available' &&
        v.driverId &&
        v.currentCityId === cargo.originCityId &&
        v.capacityKg >= cargo.weightKg,
    )
    if (!vehicle) return

    const origin = CITIES.find((c) => c.id === cargo.originCityId)!
    const destination = CITIES.find((c) => c.id === cargo.destinationCityId)!
    const route = await getCachedRoute(origin, destination)

    const departureTimestamp = Date.now()
    const cruiseSpeedKmh = vehicle.cruiseSpeedKmh ?? vehicle.averageSpeedKmh
    const tankCapacityLiters = vehicle.tankCapacityLiters ?? 0
    const refuelTargetLiters = vehicle.refuelTargetLiters ?? tankCapacityLiters
    const consumptionPer100Km = effectiveConsumptionPer100Km(
      vehicle.fuelConsumptionPer100Km ?? 0,
      cruiseSpeedKmh,
      vehicle.averageSpeedKmh,
    )

    // Si el vehículo arranca desde una ciudad donde tenemos garage, se rellena
    // con el combustible ahí almacenado antes de salir — es la única
    // instancia en la que el tanque se llena "gratis" (ya se pagó al comprar
    // ese stock en el Mercado). Si no hay garage en esta ciudad (el vehículo
    // está arrancando desde donde dejó el viaje anterior), sale con lo que ya
    // tenía en el tanque, sin más.
    const garage = company.garages.find((g) => g.cityId === vehicle.currentCityId)
    const fuelBeforeGarage = vehicle.currentFuelLiters ?? 0
    const wantedFromGarage = garage ? Math.max(0, Math.min(refuelTargetLiters, tankCapacityLiters) - fuelBeforeGarage) : 0
    const takenFromGarage = garage ? Math.min(wantedFromGarage, garage.fuelLiters) : 0
    const startingFuelLiters = fuelBeforeGarage + takenFromGarage

    const stationPrice = getGasStationPrice(company.fuelPriceHistory)
    const stopsByDistance = planFuelStops(
      route,
      startingFuelLiters,
      consumptionPer100Km,
      tankCapacityLiters,
      refuelTargetLiters,
      GAS_STATIONS,
      stationPrice,
    )
    const { fuelStops } = scheduleFuelStops(stopsByDistance, departureTimestamp, cruiseSpeedKmh)

    const trip: Trip = {
      id: crypto.randomUUID(),
      vehicleId: vehicle.id,
      route,
      departureTimestamp,
      estimatedArrivalTimestamp: estimateArrivalWithStops(departureTimestamp, route.distanceTotalKm, cruiseSpeedKmh, fuelStops.length),
      averageSpeedKmh: cruiseSpeedKmh,
      cargoCategory: cargo.category,
      payout: cargo.payout,
      startingFuelLiters,
      fuelConsumptionPer100Km: consumptionPer100Km,
      fuelStops,
    }

    setCompany((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) =>
        v.id === vehicle.id ? { ...v, status: 'in_transit', currentFuelLiters: startingFuelLiters } : v,
      ),
      garages: garage
        ? prev.garages.map((g) => (g.id === garage.id ? { ...g, fuelLiters: g.fuelLiters - takenFromGarage } : g))
        : prev.garages,
      trips: [...prev.trips, trip],
    }))
    setCargoOffers((prev) => prev.filter((c) => c.id !== cargo.id))
  }

  function collectTrip(trip: Trip) {
    const fuelCost = trip.fuelStops.reduce((sum, s) => sum + s.cost, 0)
    const settlement = settleTrip(trip.route.distanceTotalKm, trip.payout, fuelCost)
    // El combustible final del viaje (tanque lleno menos lo consumido, más lo
    // repostado en las paradas) queda guardado en el vehículo recién ahora —
    // mientras el viaje está en curso, el nivel "real" se calcula en vivo con
    // computeTripState, no se pisa el campo del vehículo hasta llegar.
    const finalFuelLiters = computeTripState(trip, Date.now()).fuelLiters
    setCompany((prev) => ({
      ...prev,
      cash: prev.cash + settlement.netProfit,
      vehicles: prev.vehicles.map((v) =>
        v.id === trip.vehicleId
          ? { ...v, status: 'available', currentCityId: trip.route.destinationCityId, currentFuelLiters: finalFuelLiters }
          : v,
      ),
      trips: prev.trips.filter((t) => t.id !== trip.id),
    }))
  }

  function buyGarage(cityId: string) {
    const cost = GARAGE_TIERS[0].cost
    setCompany((prev) => {
      if (prev.cash < cost || prev.garages.some((g) => g.cityId === cityId)) return prev
      return {
        ...prev,
        cash: prev.cash - cost,
        garages: [...prev.garages, { id: crypto.randomUUID(), tierId: GARAGE_TIERS[0].id, cityId, fuelLiters: 0 }],
      }
    })
  }

  function buyVehicle(listing: VehicleListing) {
    setCompany((prev) => {
      if (prev.cash < listing.price) return prev

      const destinationGarage = prev.garages.find((garage) => {
        const tier = GARAGE_TIERS.find((t) => t.id === garage.tierId)!
        const vehiclesHere = prev.vehicles.filter((v) => v.currentCityId === garage.cityId).length
        return vehiclesHere < tier.vehicleCapacity
      })
      if (!destinationGarage) return prev

      const newVehicle: Vehicle = {
        id: crypto.randomUUID(),
        type: CATEGORY_TO_LEGACY_TYPE[listing.category],
        averageSpeedKmh: listing.averageSpeedKmh,
        capacityKg: listing.cargoCapacityKg,
        currentCityId: destinationGarage.cityId,
        status: 'available',
        brand: listing.brand,
        model: listing.model,
        category: listing.category,
        condition: listing.condition,
        mechanicalCondition: listing.mechanicalCondition,
        mileageKm: listing.mileageKm,
        fuelConsumptionPer100Km: listing.fuelConsumptionPer100Km,
        tankCapacityLiters: listing.tankCapacityLiters,
        currentFuelLiters: listing.currentFuelLiters,
        requiredLicense: listing.requiredLicense,
        hasSleeperCabin: listing.hasSleeperCabin,
        maintenanceCostPerKm: listing.maintenanceCostPerKm,
        cruiseSpeedKmh: listing.averageSpeedKmh,
        refuelTargetLiters: listing.tankCapacityLiters,
      }

      return { ...prev, cash: prev.cash - listing.price, vehicles: [...prev.vehicles, newVehicle] }
    })
  }

  function buyFuel(garageId: string, liters: number) {
    setCompany((prev) => {
      const garage = prev.garages.find((g) => g.id === garageId)
      if (!garage || liters <= 0) return prev

      const tier = GARAGE_TIERS.find((t) => t.id === garage.tierId)!
      const cappedLiters = Math.min(liters, tier.fuelTankCapacityLiters - garage.fuelLiters)
      const price = prev.fuelPriceHistory[prev.fuelPriceHistory.length - 1]?.price ?? 0
      const totalCost = cappedLiters * price
      if (cappedLiters <= 0 || totalCost > prev.cash) return prev

      return {
        ...prev,
        cash: prev.cash - totalCost,
        garages: prev.garages.map((g) => (g.id === garageId ? { ...g, fuelLiters: g.fuelLiters + cappedLiters } : g)),
      }
    })
  }

  function hireDriver(driver: Driver, vehicleId: string) {
    setCompany((prev) => {
      const vehicle = prev.vehicles.find((v) => v.id === vehicleId)
      if (!vehicle || vehicle.driverId) return prev
      return {
        ...prev,
        drivers: [...prev.drivers, driver],
        vehicles: prev.vehicles.map((v) => (v.id === vehicleId ? { ...v, driverId: driver.id } : v)),
      }
    })
  }

  // El slider de velocidad de crucero y el de "cuánto repostar" solo se aplican
  // al PRÓXIMO viaje que acepte ese vehículo — uno ya en curso ya salió con su
  // plan de combustible fijo (ver core/fuelPlan.ts).
  function setVehicleCruiseSpeed(vehicleId: string, cruiseSpeedKmh: number) {
    setCompany((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) => (v.id === vehicleId ? { ...v, cruiseSpeedKmh } : v)),
    }))
  }

  function setVehicleRefuelTarget(vehicleId: string, refuelTargetLiters: number) {
    setCompany((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) => (v.id === vehicleId ? { ...v, refuelTargetLiters } : v)),
    }))
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-neutral-950">
      <StatsBar company={company} />
      <NavBar active={view} onChange={setView} />

      {view === 'mapa' && (
        <MapaView
          vehicles={company.vehicles}
          trips={company.trips}
          drivers={company.drivers}
          fuelPriceHistory={company.fuelPriceHistory}
          now={now}
          onCollectTrip={collectTrip}
          onSetCruiseSpeed={setVehicleCruiseSpeed}
          onSetRefuelTarget={setVehicleRefuelTarget}
        />
      )}
      {view === 'mercado' && (
        <MercadoView
          cargoOffers={cargoOffers}
          vehicles={company.vehicles}
          loading={loadingCargo}
          now={now}
          onAccept={(cargo) => void acceptCargo(cargo)}
          garages={company.garages}
          fuelPriceHistory={company.fuelPriceHistory}
          cash={company.cash}
          initialFuelGarageId={fuelPurchaseGarageId}
          onBuyFuel={buyFuel}
        />
      )}
      {view === 'garages' && (
        <MisGaragesView
          garages={company.garages}
          vehicles={company.vehicles}
          onBuyFuel={(garageId) => {
            setFuelPurchaseGarageId(garageId)
            setView('mercado')
          }}
        />
      )}
      {view === 'personal' && (
        <PersonalView drivers={company.drivers} vehicles={company.vehicles} onHire={hireDriver} />
      )}
      {view === 'expansion' && <ExpansionView company={company} onBuyGarage={buyGarage} onBuyVehicle={buyVehicle} />}

      <button
        type="button"
        onClick={() => {
          clearCompany()
          location.reload()
        }}
        className="absolute bottom-4 right-4 rounded bg-neutral-900/90 px-3 py-1.5 text-xs text-neutral-100 shadow hover:bg-neutral-800"
      >
        Reiniciar empresa (dev)
      </button>
    </div>
  )
}
