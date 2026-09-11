import type { GeoJSONSource, Map } from 'maplibre-gl'
import { Popup } from 'maplibre-gl'
import { CITIES, type City } from '../core/cities'

export const CITY_SOURCE_ID = 'cities'
export const CITY_LAYER_ID = 'cities-circle'

type CityProperties = Record<string, string | number | boolean>

function buildFeatureCollection(buildProperties: (city: City) => CityProperties) {
  return {
    type: 'FeatureCollection' as const,
    features: CITIES.map((c) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
      properties: buildProperties(c),
    })),
  }
}

interface CityLayerOptions {
  /** Qué propiedades lleva cada punto (por defecto solo id/name). Para pintar por estado
   *  (ej. "ya tenés garage acá") agregá un campo acá y referencialo en `color`. */
  buildProperties?: (city: City) => CityProperties
  color?: string | unknown[]
  radius?: number | unknown[]
  popupText?: (properties: CityProperties) => string
  onClick?: (cityId: string) => void
  /** Zoom mínimo al que se dibuja — por debajo de eso ni se intenta renderizar
   *  (no solo queda "oculta", MapLibre directamente no la procesa), para no
   *  ensuciar la vista ni competir con los vehículos cuando el mapa está muy
   *  alejado. */
  minzoom?: number
}

/**
 * Dibuja las ~2000 ciudades como una capa de puntos renderizada por GPU (no un
 * `Marker` de MapLibre por ciudad, que con este volumen de puntos hace que
 * mover/hacer zoom en el mapa se sienta trabado). Idempotente: si ya existe la
 * fuente/capa (por ejemplo porque el efecto de React que la crea corrió dos
 * veces), no la duplica.
 */
export function setupCityLayer(map: Map, options: CityLayerOptions = {}) {
  if (map.getSource(CITY_SOURCE_ID)) return

  const buildProperties = options.buildProperties ?? ((c: City) => ({ id: c.id, name: c.name }))

  map.addSource(CITY_SOURCE_ID, {
    type: 'geojson',
    data: buildFeatureCollection(buildProperties),
  })

  map.addLayer({
    id: CITY_LAYER_ID,
    type: 'circle',
    source: CITY_SOURCE_ID,
    minzoom: options.minzoom ?? 0,
    paint: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'circle-radius': (options.radius ?? 4) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'circle-color': (options.color ?? '#78716c') as any,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#1c1917',
    },
  })

  const popup = new Popup({ offset: 8, closeButton: false })

  map.on('mouseenter', CITY_LAYER_ID, (e) => {
    map.getCanvas().style.cursor = 'pointer'
    const feature = e.features?.[0]
    if (!feature || feature.geometry.type !== 'Point') return
    const props = feature.properties as CityProperties
    const text = options.popupText ? options.popupText(props) : String(props.name)
    popup.setLngLat(feature.geometry.coordinates as [number, number]).setText(text).addTo(map)
  })

  map.on('mouseleave', CITY_LAYER_ID, () => {
    map.getCanvas().style.cursor = ''
    popup.remove()
  })

  if (options.onClick) {
    const onClick = options.onClick
    map.on('click', CITY_LAYER_ID, (e) => {
      const feature = e.features?.[0]
      if (feature) onClick(String((feature.properties as CityProperties).id))
    })
  }
}

/** Reconstruye los datos de la capa (ej. cuando cambia qué ciudades están "compradas"). */
export function updateCityLayerData(map: Map, buildProperties: (city: City) => CityProperties) {
  const source = map.getSource(CITY_SOURCE_ID) as GeoJSONSource | undefined
  source?.setData(buildFeatureCollection(buildProperties))
}

/** Prende/apaga la capa (el toggle "Ciudades" del menú de opciones del mapa). */
export function setCityLayerVisible(map: Map, visible: boolean) {
  if (!map.getLayer(CITY_LAYER_ID)) return
  map.setLayoutProperty(CITY_LAYER_ID, 'visibility', visible ? 'visible' : 'none')
}
