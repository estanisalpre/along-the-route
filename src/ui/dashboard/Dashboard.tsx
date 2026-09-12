import { useEffect, useState } from 'react'
import { buildCargoOffer, type Cargo } from '../../core/cargo'
import { cargoMarketCycleIndex, cargoMarketExpiresAt, pickCargoMarketPairs } from '../../core/cargoMarket'
import { CITIES } from '../../core/cities'
import { clearCompany, saveCompany, type Company } from '../../core/company'
import type { Driver } from '../../core/driver'
import { settleTrip } from '../../core/economy'
import { effectiveConsumptionPer100Km, LOW_FUEL_LITERS, TOW_TRUCK_COST } from '../../core/fuel'
import { adjustTripFuel, cancelFuelStop, planFuelStops, replanTripFuel, resolveTowTruck, scheduleFuelStops } from '../../core/fuelPlan'
import { ensureFuelPriceHistory } from '../../core/fuelPrice'
import { GARAGE_TIERS } from '../../core/garage'
import { GAS_STATIONS, getGasStationPrice } from '../../core/gasStation'
import { positionAtDistance } from '../../core/route'
import { computeTripState, estimateArrivalWithStops, type FuelStop, type Trip } from '../../core/trip'
import type { Vehicle, VehicleType } from '../../core/vehicle'
import type { VehicleListing } from '../../core/vehicleListing'
import { getCachedDetourRoute, getCachedRoute } from '../../map/routing/routeCache'
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

  // Vigilancia de combustible bajo: normalmente `planFuelStops` ya deja agendadas
  // TODAS las paradas que va a necesitar un viaje, de una sola vez al aceptarlo
  // (ver core/fuelPlan.ts §4). Pero un viaje puede quedar sin ninguna parada
  // agendada por otras razones (ninguna gasolinera alcanzable al aceptar el
  // viaje, o el objetivo de recarga cambió a mitad de camino) — si más
  // adelante el combustible natural vuelve a bajar del umbral, acá se lo
  // detecta y se busca de nuevo la gasolinera más cercana, igual que al
  // principio, sin que el jugador tenga que acordarse de tocar nada.
  //
  // EXCEPTO si el jugador canceló una parada a propósito (`trip.
  // fuelSearchSuppressed`, ver `cancelFuelStop` en core/fuelPlan.ts): ahí el
  // vehículo sigue sin plan A PROPÓSITO ("sin importar la gasolina"), y esta
  // vigilancia se queda quieta — sin este chequeo, encontraba la misma
  // gasolinera recién cancelada un instante después (mismo tanque bajo,
  // mismas paradas vacías) y reagendaba el viaje solo, deshaciendo la
  // cancelación del jugador en un loop.
  //
  // El chequeo en sí (¿hay paradas agendadas? ¿está bajo el umbral? ¿fue
  // cancelado a propósito?) es barato; el replanteo real (con su llamada a
  // OSRM) solo corre para los pocos vehículos que de verdad lo necesitan en
  // ese momento.
  useEffect(() => {
    const rescheduled: Trip[] = []
    setCompany((prev) => {
      let changedAny = false
      const trips = prev.trips.map((trip) => {
        if (trip.fuelStops.length > 0 || trip.fuelSearchSuppressed) return trip
        const state = computeTripState(trip, now)
        if (state.status !== 'in_transit' || state.fuelLiters > LOW_FUEL_LITERS) return trip

        const vehicle = prev.vehicles.find((v) => v.id === trip.vehicleId)
        if (!vehicle) return trip
        const tankCapacityLiters = vehicle.tankCapacityLiters ?? 0
        const replanned = adjustTripFuel(
          trip,
          now,
          0,
          tankCapacityLiters,
          vehicle.refuelTargetLiters ?? tankCapacityLiters,
          GAS_STATIONS,
          getGasStationPrice(prev.fuelPriceHistory),
        )
        if (replanned === trip || replanned.fuelStops.length === 0) return trip
        changedAny = true
        rescheduled.push(replanned)
        return replanned
      })
      return changedAny ? { ...prev, trips } : prev
    })
    for (const trip of rescheduled) resolveDetourRoutes(trip.id, trip.route, trip.fuelStops)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // lado — es un lote fijo que se renueva completo cada 6 horas reales (ver
  // core/cargoMarket.ts), igual para cualquiera que juegue en simultáneo, y
  // con una oferta por cada ciudad del país — ninguna se queda sin nada,
  // aunque le toque una carga floja. Analizar la flota para ver qué te falta
  // (chofer, capacidad, range) es decisión del jugador — el mercado no
  // debería ocultar nada por eso.
  //
  // La distancia de cada oferta se estima en línea recta (no se le pide una
  // ruta real a OSRM por cada una de las ~500 ciudades solo para armar el
  // lote — sería carísimo); la ruta real se pide recién al aceptar, más
  // abajo en `acceptCargo`. Por eso esto es síncrono, no un efecto async.
  const cargoMarketCycle = cargoMarketCycleIndex(now)
  useEffect(() => {
    const expiresAt = cargoMarketExpiresAt(cargoMarketCycle)
    const offers = pickCargoMarketPairs(cargoMarketCycle, CITIES).map(({ origin, destination, estimatedDistanceKm, seed }) =>
      buildCargoOffer(origin, destination, estimatedDistanceKm, seed, expiresAt),
    )
    setCargoOffers(offers)
  }, [cargoMarketCycle])

  // Cada parada agendada nace con el desvío hacia la gasolinera en línea recta
  // (ver core/fuelPlan.ts) y, en cuanto se agenda, se le pide al mismo servicio
  // de ruteo (OSRM) que le calcula la ruta principal la geometría REAL de ese
  // desvío — sin bloquear nada mientras tanto: el desvío recto sigue siendo
  // válido (mismos tiempos/combustible, calculados con la distancia en línea
  // recta) hasta que la respuesta llega, momento en el que solo se actualiza
  // la geometría para dibujar/animar (`detourRouteGeometry`, puramente visual).
  // Si el viaje se reemplaza (replanteo, ▲/▼ de debug) antes de que resuelva,
  // el resultado simplemente no encuentra la parada que lo pidió y se descarta.
  // El vehículo se queda ESPERANDO en `atDistanceKm` (ver `TripState.refuelPhase
  // === 'waiting_for_route'`) hasta que esto resuelve — no arranca a manejar por
  // una línea que a lo mejor ni sigue calles reales. Si OSRM contesta, usa la
  // geometría y la distancia real de ahí en más (`detourOneWayKm` deja de ser la
  // estimación en línea recta); si falla, cae de todos modos a la línea recta
  // que ya tenía como estimación — no puede quedarse esperando para siempre.
  function resolveDetourRoutes(tripId: string, route: Trip['route'], fuelStops: FuelStop[]) {
    for (const stop of fuelStops) {
      if (stop.detourResolvedAt) continue
      const leavePoint = positionAtDistance(route, stop.atDistanceKm).position
      getCachedDetourRoute(leavePoint, [stop.stationLon, stop.stationLat])
        .then((detourRoute) => {
          patchDetourResolution(tripId, stop, {
            detourRouteGeometry: detourRoute.geometry,
            detourOneWayKm: detourRoute.distanceTotalKm,
          })
        })
        .catch(() => {
          patchDetourResolution(tripId, stop, {})
        })
    }
  }

  function patchDetourResolution(
    tripId: string,
    stop: FuelStop,
    patch: Partial<Pick<FuelStop, 'detourRouteGeometry' | 'detourOneWayKm'>>,
  ) {
    setCompany((prev) => ({
      ...prev,
      trips: prev.trips.map((t) => {
        if (t.id !== tripId) return t
        return {
          ...t,
          fuelStops: t.fuelStops.map((s) =>
            s.gasStationId === stop.gasStationId && s.atDistanceKm === stop.atDistanceKm && !s.detourResolvedAt
              ? { ...s, ...patch, detourResolvedAt: Date.now() }
              : s,
          ),
        }
      }),
    }))
  }

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
      estimatedArrivalTimestamp: estimateArrivalWithStops(departureTimestamp, route.distanceTotalKm, cruiseSpeedKmh, fuelStops),
      averageSpeedKmh: cruiseSpeedKmh,
      cargoCategory: cargo.category,
      payout: cargo.payout,
      startingFuelLiters,
      fuelConsumptionPer100Km: consumptionPer100Km,
      fuelStops,
      startingDistanceKm: 0,
      totalFuelCostPaid: 0,
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
    resolveDetourRoutes(trip.id, trip.route, trip.fuelStops)
    setCargoOffers((prev) => prev.filter((c) => c.id !== cargo.id))
  }

  function collectTrip(trip: Trip) {
    // `totalFuelCostPaid` guarda lo gastado en regímenes anteriores si el viaje se
    // replanificó en vivo (ver core/fuelPlan.ts) — sin eso, cambiar de idea a mitad de
    // camino haría que el resumen final "olvide" lo ya pagado antes del último cambio.
    const fuelCost = trip.totalFuelCostPaid + trip.fuelStops.reduce((sum, s) => sum + s.cost, 0)
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

  // El slider de velocidad de crucero y el de "cuánto repostar" se pueden
  // tocar en cualquier momento, viaje en curso o no — si el vehículo ya está
  // en ruta, esto además replanifica el viaje activo EN VIVO desde la
  // posición/combustible actuales (ver `replanTripFuel` en core/fuelPlan.ts):
  // llegada estimada, autonomía y próximas paradas se recalculan al toque.
  function updateVehicleFuelSettings(vehicleId: string, updates: Partial<Pick<Vehicle, 'cruiseSpeedKmh' | 'refuelTargetLiters'>>) {
    let replannedTrip: Trip | undefined
    setCompany((prev) => {
      const vehicle = prev.vehicles.find((v) => v.id === vehicleId)
      if (!vehicle) return prev
      const updatedVehicle = { ...vehicle, ...updates }
      const vehicles = prev.vehicles.map((v) => (v.id === vehicleId ? updatedVehicle : v))

      const trip = prev.trips.find((t) => t.vehicleId === vehicleId)
      if (!trip) return { ...prev, vehicles }

      const tankCapacityLiters = updatedVehicle.tankCapacityLiters ?? 0
      replannedTrip = replanTripFuel(
        trip,
        Date.now(),
        updatedVehicle.cruiseSpeedKmh ?? updatedVehicle.averageSpeedKmh,
        updatedVehicle.refuelTargetLiters ?? tankCapacityLiters,
        tankCapacityLiters,
        updatedVehicle.fuelConsumptionPer100Km ?? 0,
        updatedVehicle.averageSpeedKmh,
        GAS_STATIONS,
        getGasStationPrice(prev.fuelPriceHistory),
      )

      return { ...prev, vehicles, trips: prev.trips.map((t) => (t.id === trip.id ? replannedTrip! : t)) }
    })
    if (replannedTrip) resolveDetourRoutes(replannedTrip.id, replannedTrip.route, replannedTrip.fuelStops)
  }

  function setVehicleCruiseSpeed(vehicleId: string, cruiseSpeedKmh: number) {
    updateVehicleFuelSettings(vehicleId, { cruiseSpeedKmh })
  }

  function setVehicleRefuelTarget(vehicleId: string, refuelTargetLiters: number) {
    updateVehicleFuelSettings(vehicleId, { refuelTargetLiters })
  }

  // Botoncito de debug (▲/▼) para forzar el combustible de un vehículo sin
  // esperar a que lo consuma solo — así se puede probar la mecánica de
  // gasolineras a demanda. Si el vehículo está en viaje, ajusta el viaje en
  // vivo (ver `adjustTripFuel`); si está parado, ajusta el tanque directo.
  function adjustVehicleFuel(vehicleId: string, deltaLiters: number) {
    let adjustedTrip: Trip | undefined
    setCompany((prev) => {
      const vehicle = prev.vehicles.find((v) => v.id === vehicleId)
      if (!vehicle) return prev
      const tankCapacityLiters = vehicle.tankCapacityLiters ?? 0

      const trip = prev.trips.find((t) => t.vehicleId === vehicleId)
      if (!trip) {
        const currentFuelLiters = Math.max(0, Math.min(tankCapacityLiters, (vehicle.currentFuelLiters ?? 0) + deltaLiters))
        return { ...prev, vehicles: prev.vehicles.map((v) => (v.id === vehicleId ? { ...v, currentFuelLiters } : v)) }
      }

      adjustedTrip = adjustTripFuel(
        trip,
        Date.now(),
        deltaLiters,
        tankCapacityLiters,
        vehicle.refuelTargetLiters ?? tankCapacityLiters,
        GAS_STATIONS,
        getGasStationPrice(prev.fuelPriceHistory),
      )
      return { ...prev, trips: prev.trips.map((t) => (t.id === trip.id ? adjustedTrip! : t)) }
    })
    if (adjustedTrip) resolveDetourRoutes(adjustedTrip.id, adjustedTrip.route, adjustedTrip.fuelStops)
  }

  // Botón "Cancelar parada" (VehicleDetailPanel.tsx, solo visible mientras
  // `status === 'refueling'`): corta el desvío a mitad de camino, sea la fase
  // que sea, y retoma directo hacia el destino con el combustible que tenga
  // en ese momento — sin agendar ninguna parada nueva (ver `cancelFuelStop`
  // en core/fuelPlan.ts). No hace falta pedirle nada a OSRM: al no quedar
  // ninguna parada, no hay desvío que resolver.
  function cancelVehicleFuelStop(vehicleId: string) {
    setCompany((prev) => {
      const trip = prev.trips.find((t) => t.vehicleId === vehicleId)
      if (!trip) return prev
      const cancelledTrip = cancelFuelStop(trip, Date.now())
      if (cancelledTrip === trip) return prev
      return { ...prev, trips: prev.trips.map((t) => (t.id === trip.id ? cancelledTrip : t)) }
    })
  }

  // Botón "Llamar a la grúa" (VehicleDetailPanel.tsx, solo visible mientras
  // `status === 'stranded'`): descuenta el costo fijo de la empresa y llena
  // el tanque al toque, sin espera — la grúa "ya vino" (ver
  // core/fuelPlan.ts `resolveTowTruck`). Como al volver a tener el tanque
  // lleno puede hacer falta OTRA parada más adelante, se le pide al servicio
  // de ruteo el desvío de cualquier parada nueva, igual que en cualquier
  // otro replanteo.
  function callTowTruck(vehicleId: string) {
    let rescuedTrip: Trip | undefined
    setCompany((prev) => {
      const vehicle = prev.vehicles.find((v) => v.id === vehicleId)
      const trip = prev.trips.find((t) => t.vehicleId === vehicleId)
      if (!vehicle || !trip) return prev
      const tankCapacityLiters = vehicle.tankCapacityLiters ?? 0
      rescuedTrip = resolveTowTruck(
        trip,
        Date.now(),
        tankCapacityLiters,
        vehicle.refuelTargetLiters ?? tankCapacityLiters,
        GAS_STATIONS,
        getGasStationPrice(prev.fuelPriceHistory),
      )
      if (rescuedTrip === trip) return prev
      return {
        ...prev,
        cash: prev.cash - TOW_TRUCK_COST,
        trips: prev.trips.map((t) => (t.id === trip.id ? rescuedTrip! : t)),
      }
    })
    if (rescuedTrip) resolveDetourRoutes(rescuedTrip.id, rescuedTrip.route, rescuedTrip.fuelStops)
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
          onAdjustFuel={adjustVehicleFuel}
          onCancelFuelStop={cancelVehicleFuelStop}
          onCallTowTruck={callTowTruck}
        />
      )}
      {view === 'mercado' && (
        <MercadoView
          cargoOffers={cargoOffers}
          vehicles={company.vehicles}
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
