import { Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { CITIES } from '../../core/cities'
import { formatArs } from '../../core/format'
import { GARAGE_TIERS } from '../../core/garage'
import { normalizeForSearch } from '../../core/text'
import { CITY_LAYER_ID, setupCityLayer, updateCityLayerData } from '../../map/cityLayer'
import { getMapStyleUrl } from '../../map/timeOfDay'
import { useTimeOfDayTint } from '../../map/useTimeOfDayTint'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function colorExpression(ownedCityIds: string[]): any {
  return ['match', ['get', 'id'], ownedCityIds.length > 0 ? ownedCityIds : [''], '#22c55e', '#78716c']
}

interface GarageMarketMapProps {
  ownedCityIds: string[]
  cash: number
  onBuy: (cityId: string) => void
}

export function GarageMarketMap({ ownedCityIds, cash, onBuy }: GarageMarketMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const cost = GARAGE_TIERS[0].cost
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!containerRef.current) return

    const map = new Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      center: [-63.6, -38.4],
      zoom: 3.2,
    })
    map.on('load', () => {
      map.setProjection({ type: 'globe' })
      setupCityLayer(map, {
        color: colorExpression(ownedCityIds),
        buildProperties: (c) => ({ id: c.id, name: c.name, owned: ownedCityIds.includes(c.id) }),
        popupText: (props) => (props.owned ? `${props.name} — ya tenés un garage acá` : String(props.name)),
      })
    })
    mapRef.current = map

    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Repinta y actualiza los datos cuando cambia qué ciudades ya tienen garage.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      map.setPaintProperty(CITY_LAYER_ID, 'circle-color', colorExpression(ownedCityIds))
      updateCityLayerData(map, (c) => ({ id: c.id, name: c.name, owned: ownedCityIds.includes(c.id) }))
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedCityIds.join(',')])

  const visibleCities = search.trim()
    ? CITIES.filter((c) => normalizeForSearch(c.name).includes(normalizeForSearch(search)))
    : CITIES
  const sunTint = useTimeOfDayTint()

  return (
    <div className="flex gap-4">
      <div className="relative h-96 min-w-0 flex-1 overflow-hidden rounded-xl border border-neutral-800">
        <div ref={containerRef} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: sunTint }} />
      </div>
      <div className="flex w-72 shrink-0 flex-col">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ciudad..."
          className="mb-2 w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-orange-500"
        />
        <div className="h-96 space-y-2 overflow-y-auto pr-1">
          {visibleCities.map((city) => {
            const owned = ownedCityIds.includes(city.id)
            const canAfford = cash >= cost
            return (
              <div
                key={city.id}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
              >
                <div>
                  <div className="text-white">{city.name}</div>
                  <div className="text-xs text-neutral-500">{city.province}</div>
                </div>
                {owned ? (
                  <span className="text-xs text-emerald-400">✓ Tenés sede</span>
                ) : (
                  <button
                    type="button"
                    disabled={!canAfford}
                    onClick={() => onBuy(city.id)}
                    className={`shrink-0 rounded px-3 py-1 text-xs font-semibold ${
                      canAfford
                        ? 'bg-orange-500 text-white hover:bg-orange-400'
                        : 'cursor-not-allowed bg-neutral-700 text-neutral-500'
                    }`}
                  >
                    Comprar {formatArs(cost)}
                  </button>
                )}
              </div>
            )
          })}
          {visibleCities.length === 0 && <p className="text-sm text-neutral-500">Ninguna ciudad coincide.</p>}
        </div>
      </div>
    </div>
  )
}
