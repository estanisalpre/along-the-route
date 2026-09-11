// Mismo patrón de store mínimo que mapDisplayMode.ts. Los vehículos nunca se
// pueden ocultar (son lo único que realmente importa ver siempre) — esto es
// solo para las capas "decorativas" que pueden ensuciar la vista cuando el
// mapa está muy alejado.
export interface MapLayerVisibility {
  showCities: boolean
  showGasStations: boolean
}

const STORAGE_KEY = 'porlaruta.mapLayerVisibility'

type Listener = () => void
const listeners = new Set<Listener>()

function readStored(): MapLayerVisibility {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { showCities: true, showGasStations: true }
    const parsed = JSON.parse(raw)
    return {
      showCities: parsed.showCities ?? true,
      showGasStations: parsed.showGasStations ?? true,
    }
  } catch {
    return { showCities: true, showGasStations: true }
  }
}

let visibility: MapLayerVisibility = readStored()

export function getMapLayerVisibility(): MapLayerVisibility {
  return visibility
}

export function setMapLayerVisibility(next: Partial<MapLayerVisibility>): void {
  visibility = { ...visibility, ...next }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility))
  for (const listener of listeners) listener()
}

export function subscribeMapLayerVisibility(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
