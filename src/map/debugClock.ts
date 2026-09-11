// Store mínimo (no hace falta una librería de estado global para esto) para
// que el navbar y los mapas compartan el mismo desfasaje de reloj de debug.
// El offset es un corrimiento FIJO sobre la hora real: el reloj sigue
// andando a velocidad normal, solo que arrancando más adelante o atrás — así
// se puede "viajar" al amanecer/atardecer para probar el filtro sin congelar
// el tiempo.
type Listener = () => void

let offsetMs = 0
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

export function getDebugNow(): number {
  return Date.now() + offsetMs
}

export function getDebugOffsetMs(): number {
  return offsetMs
}

export function shiftDebugClock(deltaMs: number): void {
  offsetMs += deltaMs
  notify()
}

export function resetDebugClock(): void {
  offsetMs = 0
  notify()
}

export function subscribeDebugClock(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
