import type { Map } from 'maplibre-gl'
import { GAS_STATIONS } from '../core/gasStation'

export const GAS_STATION_SOURCE_ID = 'gas-stations'
export const GAS_STATION_LAYER_ID = 'gas-stations-circle'

/** Todas las gasolineras se pintan igual, sin importar la marca — un solo punto
 *  rojo reconocible de un vistazo, en vez de competir por colores con las
 *  ciudades y los vehículos. */
const GAS_STATION_COLOR = '#ef4444'

/**
 * Capa de gasolineras: un círculo rojo por estación. Se dibuja como capa
 * nativa 'circle' (no un ícono/símbolo) a propósito — MapLibre siempre
 * renderiza las capas de símbolos/texto por encima de todo lo demás (ver
 * DashboardMap.tsx, mismo motivo por el que las etiquetas de ciudad tapaban
 * a los vehículos 3D), así que un ícono real de gasolinera terminaría
 * siempre arriba de los vehículos sin importar el orden en que se agreguen.
 * Con un círculo sí se puede controlar el orden — se agrega ANTES que las
 * capas 3D de los vehículos y nunca se mueve por encima de ellas.
 *
 * Sin `minzoom`: nunca se dejan de dibujar, a ningún zoom — se van achicando
 * (ver `circle-radius`) en vez de desaparecer, así no compiten con los
 * vehículos cuando el mapa está muy alejado pero tampoco hay que lidiar con
 * el punto apareciendo/desapareciendo de golpe al cruzar un umbral.
 */
export function setupGasStationLayer(map: Map, onClick: (gasStationId: string) => void) {
  if (map.getSource(GAS_STATION_SOURCE_ID)) return

  map.addSource(GAS_STATION_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: GAS_STATIONS.map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: { id: s.id, brand: s.brand },
      })),
    },
  })

  map.addLayer({
    id: GAS_STATION_LAYER_ID,
    type: 'circle',
    source: GAS_STATION_SOURCE_ID,
    paint: {
      // Más chico cuanto más acercado — al revés de los vehículos, que crecen con el zoom.
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 6, 15, 2.5] as unknown as number,
      'circle-color': GAS_STATION_COLOR,
      'circle-stroke-width': 0.7,
      'circle-stroke-color': '#0a0a0a',
    },
  })

  map.on('mouseenter', GAS_STATION_LAYER_ID, () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', GAS_STATION_LAYER_ID, () => {
    map.getCanvas().style.cursor = ''
  })
  map.on('click', GAS_STATION_LAYER_ID, (e) => {
    const feature = e.features?.[0]
    if (!feature) return
    onClick(String((feature.properties as { id: string }).id))
  })
}

/** Prende/apaga la capa (el toggle "Gasolineras" del menú de opciones del mapa). */
export function setGasStationLayerVisible(map: Map, visible: boolean) {
  if (!map.getLayer(GAS_STATION_LAYER_ID)) return
  map.setLayoutProperty(GAS_STATION_LAYER_ID, 'visibility', visible ? 'visible' : 'none')
}
