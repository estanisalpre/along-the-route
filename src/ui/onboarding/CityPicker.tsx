import { Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CITIES } from '../../core/cities'
import { formatArs } from '../../core/format'
import { GARAGE_TIERS } from '../../core/garage'
import { normalizeForSearch } from '../../core/text'
import { CITY_LAYER_ID, setupCityLayer } from '../../map/cityLayer'
import { getMapStyleUrl } from '../../map/timeOfDay'
import { useTimeOfDayTint } from '../../map/useTimeOfDayTint'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function radiusExpression(selectedCityId: string | null): any {
  return ['case', ['==', ['get', 'id'], selectedCityId ?? ''], 8, 4]
}

interface CityPickerProps {
  selectedCityId: string | null
  onSelect: (cityId: string) => void
}

export function CityPicker({ selectedCityId, onSelect }: CityPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const onSelectRef = useRef(onSelect)
  useLayoutEffect(() => {
    onSelectRef.current = onSelect
  })

  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!containerRef.current) return

    const map = new Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      center: [-63.6, -38.4],
      zoom: 1.6,
    })
    map.on('load', () => {
      setupCityLayer(map, {
        color: '#f97316',
        radius: radiusExpression(selectedCityId),
        popupText: (props) => `${props.name} — ${formatArs(GARAGE_TIERS[0].cost)}`,
        onClick: (cityId) => onSelectRef.current(cityId),
      })
    })
    mapRef.current = map

    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Agranda el punto de la ciudad elegida.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => map.setPaintProperty(CITY_LAYER_ID, 'circle-radius', radiusExpression(selectedCityId))
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [selectedCityId])

  const filtered = search.trim()
    ? CITIES.filter((c) => normalizeForSearch(c.name).includes(normalizeForSearch(search)))
    : []
  const sunTint = useTimeOfDayTint()

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-xl border border-neutral-700">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: sunTint }} />
      <div className="pointer-events-none absolute top-3 left-3 right-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ciudad..."
          className="pointer-events-auto w-full rounded bg-neutral-900/90 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-400 outline-none focus:ring-2 focus:ring-orange-500"
        />
        {filtered.length > 0 && (
          <ul className="pointer-events-auto mt-1 max-h-40 overflow-y-auto rounded bg-neutral-900/95 text-sm text-neutral-100 shadow-lg">
            {filtered.map((city) => (
              <li key={city.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(city.id)
                    mapRef.current?.flyTo({ center: [city.lon, city.lat], zoom: 8 })
                    setSearch('')
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-neutral-800"
                >
                  {city.name} <span className="text-neutral-400">— {city.province}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
