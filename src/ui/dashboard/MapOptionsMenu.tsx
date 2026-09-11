import { useEffect, useState } from 'react'
import { getMapDisplayMode, setMapDisplayMode, subscribeMapDisplayMode, type MapDisplayMode } from '../../map/mapDisplayMode'
import { getMapLayerVisibility, setMapLayerVisibility, subscribeMapLayerVisibility } from '../../map/mapLayerVisibility'

const MODE_OPTIONS: { id: MapDisplayMode; label: string }[] = [
  { id: 'dark', label: 'Oscuro' },
  { id: 'light', label: 'Claro' },
  { id: 'real', label: 'Hora real' },
]

export function MapOptionsMenu() {
  const [mode, setMode] = useState(getMapDisplayMode)
  const [visibility, setVisibility] = useState(getMapLayerVisibility)

  useEffect(() => subscribeMapDisplayMode(() => setMode(getMapDisplayMode())), [])
  useEffect(() => subscribeMapLayerVisibility(() => setVisibility(getMapLayerVisibility())), [])

  return (
    <div className="group absolute bottom-8 left-4 z-10 flex items-end gap-2">
      <button
        type="button"
        aria-label="Opciones del mapa"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/90 text-base shadow-lg"
      >
        🗺️
      </button>
      <div className="flex origin-bottom-left scale-95 flex-col gap-2 rounded-lg border border-neutral-700 bg-neutral-900/95 p-2 opacity-0 shadow-lg transition-all duration-150 pointer-events-none group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap pl-1 text-xs font-medium text-neutral-400">Modo:</span>
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMapDisplayMode(opt.id)}
              className={`whitespace-nowrap rounded px-2 py-1 text-xs font-medium transition-colors ${
                mode === opt.id ? 'bg-orange-500 text-white' : 'text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-800 pt-2">
          <span className="whitespace-nowrap pl-1 text-xs font-medium text-neutral-400">Ver:</span>
          <label className="flex items-center gap-1.5 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={visibility.showCities}
              onChange={(e) => setMapLayerVisibility({ showCities: e.target.checked })}
              className="accent-orange-500"
            />
            Ciudades
          </label>
          <label className="flex items-center gap-1.5 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={visibility.showGasStations}
              onChange={(e) => setMapLayerVisibility({ showGasStations: e.target.checked })}
              className="accent-orange-500"
            />
            Gasolineras
          </label>
          <span className="whitespace-nowrap text-xs text-neutral-600" title="Los vehículos siempre se ven, no se pueden ocultar">
            Vehículos: siempre
          </span>
        </div>
      </div>
    </div>
  )
}
