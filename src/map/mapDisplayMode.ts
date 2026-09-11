// Mismo patrón de store mínimo que debugClock.ts: el menú de opciones del mapa
// y los hooks de día/noche comparten este modo sin necesitar una librería de
// estado global.
export type MapDisplayMode = 'dark' | 'light' | 'real'

const STORAGE_KEY = 'porlaruta.mapDisplayMode'

type Listener = () => void
const listeners = new Set<Listener>()

function readStored(): MapDisplayMode {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'dark' || raw === 'light' || raw === 'real' ? raw : 'real'
}

let mode: MapDisplayMode = readStored()

export function getMapDisplayMode(): MapDisplayMode {
  return mode
}

export function setMapDisplayMode(next: MapDisplayMode): void {
  mode = next
  localStorage.setItem(STORAGE_KEY, next)
  for (const listener of listeners) listener()
}

export function subscribeMapDisplayMode(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
