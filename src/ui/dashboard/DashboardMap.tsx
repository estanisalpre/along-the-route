import type { GeoJSONSource } from 'maplibre-gl'
import { Map, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { CITIES } from '../../core/cities'
import { LOW_FUEL_LITERS } from '../../core/fuel'
import { computeTripState, type Trip } from '../../core/trip'
import type { Vehicle } from '../../core/vehicle'
import { setCityLayerVisible, setupCityLayer } from '../../map/cityLayer'
import { setGasStationLayerVisible, setupGasStationLayer } from '../../map/gasStationLayer'
import { getMapLayerVisibility, subscribeMapLayerVisibility } from '../../map/mapLayerVisibility'
import { ThreeVehicleLayer } from '../../map/ThreeVehicleLayer'
import { useMapStyleUrl } from '../../map/useMapStyleUrl'
import { useTimeOfDayTint } from '../../map/useTimeOfDayTint'

const ROUTE_SOURCE_ID = 'selected-route'
const DETOUR_SOURCE_ID = 'fuel-detour-line'

// Límites de zoom del mapa: MIN_ZOOM es lo más "lejos" que se puede alejar
// (valores bajos = ver más mundo), MAX_ZOOM es lo más cerca que se puede
// acercar (valores altos = más acercado, casi a nivel de calle).
const MIN_ZOOM = 3
const MAX_ZOOM = 15

// Tamaño del vehículo 3D en pantalla (px) en cada extremo del rango de zoom.
// Entre esos dos zooms se interpola, así que al zoom más alejado (MIN_ZOOM) se
// ve grande y prominente (nunca desaparece) y va achicándose a medida que te
// acercás — hasta que el tamaño real del modelo (5 metros) supera este piso y
// ahí ya manda la escala real, creciendo más todavía con más zoom.
const VEHICLE_SIZE_AT_MIN_ZOOM_PX = 30
const VEHICLE_SIZE_AT_MAX_ZOOM_PX = 20

// Ciudades y gasolineras dejan de dibujarse directamente por debajo de estos
// zooms — no solo el toggle manual del menú de opciones, esto es automático:
// alejado del todo hay demasiados puntos amontonados y terminan ensuciando la
// vista justo donde importa ver los vehículos. Los vehículos nunca tienen
// este piso (ver VEHICLE_SIZE_AT_MIN_ZOOM_PX arriba, siempre visibles).
const CITY_MIN_VISIBLE_ZOOM = 6
const GAS_STATION_MIN_VISIBLE_ZOOM = 7

// Prueba de concepto: todos los vehículos usan este mismo modelo 3D mientras
// se prueba cómo se ve/gira siguiendo rutas reales. Más adelante cada tipo de
// vehículo (Runner/Pampera/Titán) tendría su propio modelo.
const VEHICLE_MODEL_URL = '/assets/vehicles/3d/test/delivery.glb'

function vehicleLayerId(vehicleId: string) {
  return `three-vehicle-${vehicleId}`
}

/** Cada click en "Centrar" arma un objeto nuevo (el `nonce` cambia) para que
 *  se pueda volver a centrar sobre el mismo vehículo seguido sin que React
 *  ignore el cambio por creer que las props no cambiaron. */
export interface FocusVehicleRequest {
  vehicleId: string
  nonce: number
}

/** Igual que `FocusVehicleRequest` pero para una gasolinera (posición fija, no hace falta buscarla). */
export interface FocusGasStationRequest {
  lat: number
  lon: number
  nonce: number
}

interface DashboardMapProps {
  vehicles: Vehicle[]
  trips: Trip[]
  selectedVehicleId: string | null
  onSelectVehicle: (vehicleId: string | null) => void
  onSelectGasStation: (gasStationId: string) => void
  focusRequest: FocusVehicleRequest | null
  gasStationFocusRequest: FocusGasStationRequest | null
}

export function DashboardMap({
  vehicles,
  trips,
  selectedVehicleId,
  onSelectVehicle,
  onSelectGasStation,
  focusRequest,
  gasStationFocusRequest,
}: DashboardMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const vehicleMarkersRef = useRef<Record<string, Marker>>({})
  const vehicleLayersRef = useRef<Record<string, ThreeVehicleLayer>>({})
  const metaMarkersRef = useRef<Marker[]>([])
  const appliedStyleUrlRef = useRef<string | null>(null)

  // Refs "vivas" con el último valor de props, para que el loop de animación y
  // los listeners de click (que corren fuera del ciclo de render de React)
  // siempre lean datos frescos sin tener que reiniciarse.
  const vehiclesRef = useRef(vehicles)
  const tripsRef = useRef(trips)
  const selectedVehicleIdRef = useRef(selectedVehicleId)
  const onSelectVehicleRef = useRef(onSelectVehicle)
  const onSelectGasStationRef = useRef(onSelectGasStation)
  useLayoutEffect(() => {
    vehiclesRef.current = vehicles
    tripsRef.current = trips
    selectedVehicleIdRef.current = selectedVehicleId
    onSelectVehicleRef.current = onSelectVehicle
    onSelectGasStationRef.current = onSelectGasStation
  })

  const styleUrl = useMapStyleUrl()

  useEffect(() => {
    if (!containerRef.current) return

    const map = new Map({
      container: containerRef.current,
      style: styleUrl,
      center: [-63.6, -38.4],
      zoom: 1.6,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    })
    appliedStyleUrlRef.current = styleUrl
    map.on('load', () => {
      map.setProjection({ type: 'globe' })
      // Arranca mostrando la Tierra como planeta y "llega" hasta Argentina.
      map.flyTo({ center: [-63.6, -38.4], zoom: 4, duration: 3000, essential: true })
      // Una vez terminada esa intro, se pasa a mercator "de verdad" (no solo
      // visualmente aplanado). Los vehículos 3D se ubican con matemática de
      // mercator plano — con el globo todavía activo, a zoom alejado/medio la
      // curvatura de la esfera no coincide con esa matemática y terminan mal
      // ubicados (a veces bien lejos de donde deberían estar).
      map.once('moveend', () => map.setProjection({ type: 'mercator' }))

      setupCityLayer(map, { minzoom: CITY_MIN_VISIBLE_ZOOM })
      setupGasStationLayer(map, (id) => onSelectGasStationRef.current(id), GAS_STATION_MIN_VISIBLE_ZOOM)
      applyLayerVisibility(map)
    })
    // Clickear el mapa vacío deselecciona el vehículo activo.
    map.on('click', () => onSelectVehicleRef.current(null))
    mapRef.current = map
    map.addControl(new NavigationControl(), 'top-right')

    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Si cambia el día/noche (reloj real o de debug) mientras el mapa ya está
  // creado, cambia el estilo en caliente y vuelve a montar la capa de ciudades
  // y la ruta seleccionada (un `setStyle` reemplaza todo lo que no sea parte
  // del estilo nuevo).
  useEffect(() => {
    const map = mapRef.current
    if (!map || appliedStyleUrlRef.current === styleUrl) return
    appliedStyleUrlRef.current = styleUrl
    map.setStyle(styleUrl)
    map.once('style.load', () => {
      setupCityLayer(map, { minzoom: CITY_MIN_VISIBLE_ZOOM })
      setupGasStationLayer(map, (id) => onSelectGasStationRef.current(id), GAS_STATION_MIN_VISIBLE_ZOOM)
      applyLayerVisibility(map)
      // `setStyle` se lleva puestas las capas custom (los modelos 3D) — se
      // olvidan las instancias viejas y se recrean solas en el próximo cuadro
      // del loop de animación, en vez de reusarlas (reusarlas duplicaría luces
      // y volvería a cargar el modelo dentro de la misma escena de Three.js).
      vehicleLayersRef.current = {}
      applySelectedRoute(map, metaMarkersRef, tripsRef.current, selectedVehicleIdRef.current)
    })
  }, [styleUrl])

  // Dibuja la ruta + banderas de salida/llegada SOLO del vehículo seleccionado.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const apply = () => applySelectedRoute(map, metaMarkersRef, trips, selectedVehicleId)
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [trips, selectedVehicleId])

  // Botón "Centrar" de las tarjetas de Viajes/Esperando carga: vuela hasta la
  // posición actual del vehículo (en ruta o parado en su ciudad).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusRequest) return

    const vehicle = vehiclesRef.current.find((v) => v.id === focusRequest.vehicleId)
    if (!vehicle) return

    const trip = tripsRef.current.find((t) => t.vehicleId === vehicle.id)
    let lngLat: [number, number]
    if (trip) {
      lngLat = computeTripState(trip, Date.now()).position
    } else {
      const city = CITIES.find((c) => c.id === vehicle.currentCityId)
      if (!city) return
      lngLat = [city.lon, city.lat]
    }

    map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 12), essential: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest])

  // Mismo botón "Centrar" pero para una gasolinera — su posición es fija, no
  // hace falta buscarla en vehicles/trips.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !gasStationFocusRequest) return
    map.flyTo({
      center: [gasStationFocusRequest.lon, gasStationFocusRequest.lat],
      zoom: Math.max(map.getZoom(), 14),
      essential: true,
    })
  }, [gasStationFocusRequest])

  // Toggle "Ciudades"/"Gasolineras" del menú de opciones del mapa — se aplica
  // al toque, sin recargar el estilo (es solo prender/apagar la capa).
  useEffect(() => {
    return subscribeMapLayerVisibility(() => {
      const map = mapRef.current
      if (map) applyLayerVisibility(map)
    })
  }, [])

  // Anima la posición/rotación de cada vehículo cuadro a cuadro (requestAnimationFrame),
  // en vez de depender del tick de 1s del resto del dashboard — así el camión se
  // desliza suave por la ruta en lugar de saltar de punto en punto.
  useEffect(() => {
    let rafId: number

    function frame() {
      const map = mapRef.current
      if (map?.isStyleLoaded()) {
        const now = Date.now()
        updateVehicleMarkers(
          map,
          vehicleMarkersRef.current,
          vehicleLayersRef.current,
          vehiclesRef.current,
          tripsRef.current,
          now,
          selectedVehicleIdRef.current,
          onSelectVehicleRef,
        )
        applyFuelDetourLine(map, tripsRef.current, selectedVehicleIdRef.current, now)
      }
      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const sunTint = useTimeOfDayTint()

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: sunTint }} />
    </div>
  )
}

function applyLayerVisibility(map: Map) {
  const visibility = getMapLayerVisibility()
  setCityLayerVisible(map, visibility.showCities)
  setGasStationLayerVisible(map, visibility.showGasStations)
}

function applySelectedRoute(map: Map, metaMarkersRef: { current: Marker[] }, trips: Trip[], selectedVehicleId: string | null) {
  for (const marker of metaMarkersRef.current) marker.remove()
  metaMarkersRef.current = []
  if (map.getLayer(ROUTE_SOURCE_ID)) map.removeLayer(ROUTE_SOURCE_ID)
  if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID)

  const trip = trips.find((t) => t.vehicleId === selectedVehicleId)
  if (!trip) return

  map.addSource(ROUTE_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: trip.route.geometry },
    },
  })
  map.addLayer({
    id: ROUTE_SOURCE_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#2563eb', 'line-width': 3 },
  })

  const start = trip.route.geometry[0]
  const end = trip.route.geometry[trip.route.geometry.length - 1]
  metaMarkersRef.current = [createFlagMarker('🟢', start).addTo(map), createFlagMarker('🏁', end).addTo(map)]
}

/**
 * Línea verde de "desvío" hacia la gasolinera: se muestra desde el momento en
 * que hay una parada agendada pendiente (`state.upcomingFuelStop` — apenas se
 * planifica, no hace falta esperar a que llegue, sea hacia adelante o, si la
 * gasolinera alcanzable más cercana quedó atrás, hacia atrás — ver
 * `planFuelStops`) y sigue mostrándose mientras ya está parado repostando ahí
 * (`state.activeFuelStop`). Va desde la posición actual del vehículo — no un
 * punto fijo — hasta la gasolinera, así se achica solo a medida que se
 * acerca. Se llama en cada cuadro del loop de animación — no en el mismo
 * efecto que dibuja la línea azul — porque necesita saber el `status` de
 * AHORA, no solo si cambió el viaje/vehículo seleccionado.
 */
function applyFuelDetourLine(map: Map, trips: Trip[], selectedVehicleId: string | null, now: number) {
  const trip = trips.find((t) => t.vehicleId === selectedVehicleId)
  const state = trip ? computeTripState(trip, now) : undefined
  const stop = state?.activeFuelStop ?? state?.upcomingFuelStop

  if (!stop || !state) {
    if (map.getLayer(DETOUR_SOURCE_ID)) map.setLayoutProperty(DETOUR_SOURCE_ID, 'visibility', 'none')
    return
  }

  const stationPoint: [number, number] = [stop.stationLon, stop.stationLat]
  // Si el servicio de ruteo (OSRM) ya resolvió el camino real hasta la gasolinera, se dibuja
  // ese (por calles) — mientras el pedido sigue en vuelo, una línea recta como aproximación
  // transitoria desde la posición actual (se autocorrige sola frame a frame).
  const coordinates = stop.detourRouteGeometry ?? [state.position, stationPoint]
  const feature = {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates },
  }

  const source = map.getSource(DETOUR_SOURCE_ID) as GeoJSONSource | undefined
  if (source) {
    source.setData(feature)
    map.setLayoutProperty(DETOUR_SOURCE_ID, 'visibility', 'visible')
    return
  }

  map.addSource(DETOUR_SOURCE_ID, { type: 'geojson', data: feature })
  map.addLayer({
    id: DETOUR_SOURCE_ID,
    type: 'line',
    source: DETOUR_SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#22c55e', 'line-width': 3, 'line-dasharray': [2, 1.5] },
  })
}

function createFlagMarker(emoji: string, lngLat: [number, number]): Marker {
  const el = document.createElement('div')
  el.textContent = emoji
  el.style.fontSize = '18px'
  return new Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat)
}

function updateVehicleMarkers(
  map: Map,
  markers: Record<string, Marker>,
  layers: Record<string, ThreeVehicleLayer>,
  vehicles: Vehicle[],
  trips: Trip[],
  now: number,
  selectedVehicleId: string | null,
  onSelectVehicleRef: { current: (vehicleId: string | null) => void },
) {
  const seen = new Set<string>()

  for (const vehicle of vehicles) {
    seen.add(vehicle.id)
    const trip = trips.find((t) => t.vehicleId === vehicle.id)

    let lngLat: [number, number]
    let rotation = 0
    let fuelLiters: number | undefined
    if (trip) {
      const state = computeTripState(trip, now)
      lngLat = state.position
      rotation = state.bearing
      fuelLiters = state.fuelLiters
    } else {
      const city = CITIES.find((c) => c.id === vehicle.currentCityId)
      if (!city) continue
      lngLat = [city.lon, city.lat]
      fuelLiters = vehicle.currentFuelLiters
    }

    // El marker DOM ya no muestra el emoji — el modelo 3D es el vehículo
    // visible ahora — pero se mantiene invisible como zona de click para
    // seleccionar el vehículo.
    let marker = markers[vehicle.id]
    if (!marker) {
      const el = document.createElement('div')
      el.style.width = '28px'
      el.style.height = '28px'
      el.style.cursor = 'pointer'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelectVehicleRef.current(vehicle.id)
      })
      marker = new Marker({ element: el, rotationAlignment: 'map' }).setLngLat(lngLat).addTo(map)
      markers[vehicle.id] = marker
    } else {
      marker.setLngLat(lngLat)
    }
    marker.setRotation(rotation)
    // Combustible bajo (≤10L) manda sobre el resaltado de selección: aro rojo
    // parpadeante (alterna cada 400ms usando el propio reloj del loop, sin
    // necesitar una animación CSS aparte) — avisa incluso si no está seleccionado.
    const lowFuel = fuelLiters !== undefined && fuelLiters <= LOW_FUEL_LITERS
    const blinkOn = Math.floor(now / 400) % 2 === 0
    if (lowFuel && blinkOn) {
      marker.getElement().style.boxShadow = '0 0 0 4px rgba(239,68,68,0.95)'
    } else if (vehicle.id === selectedVehicleId) {
      marker.getElement().style.boxShadow = '0 0 0 3px rgba(249,115,22,0.9)'
    } else {
      marker.getElement().style.boxShadow = 'none'
    }
    marker.getElement().style.borderRadius = '50%'

    let layer = layers[vehicle.id]
    if (!layer) {
      const id = vehicleLayerId(vehicle.id)
      // Si dos cambios de estilo se solapan (ej. clickear rápido entre modos
      // del mapa), el reset de esta ref puede correr antes de que MapLibre
      // termine de limpiar la capa vieja del estilo anterior — sin este
      // chequeo, `addLayer` explota con "layer already exists".
      if (map.getLayer(id)) map.removeLayer(id)
      layer = new ThreeVehicleLayer(id, VEHICLE_MODEL_URL, lngLat, {
        modelLengthMeters: 5,
        uprightCorrectionDeg: 90,
        headingOffsetDeg: 180,
        sizeAtMinZoomPx: VEHICLE_SIZE_AT_MIN_ZOOM_PX,
        sizeAtMaxZoomPx: VEHICLE_SIZE_AT_MAX_ZOOM_PX,
      })
      map.addLayer(layer)
      layers[vehicle.id] = layer
    }
    // Se reordena al tope en CADA cuadro, no solo al crearla: capas que se
    // agregan después (la línea azul de la ruta seleccionada, por ejemplo,
    // se agrega/reagrega cada vez que cambia el viaje elegido) quedarían por
    // encima si esto se hiciera una sola vez al crear el vehículo.
    map.moveLayer(layer.id)
    layer.setState(lngLat, rotation)
  }

  for (const [id, marker] of Object.entries(markers)) {
    if (!seen.has(id)) {
      marker.remove()
      delete markers[id]
    }
  }
  for (const [id, layer] of Object.entries(layers)) {
    if (!seen.has(id)) {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id)
      delete layers[id]
    }
  }

  map.triggerRepaint()
}
