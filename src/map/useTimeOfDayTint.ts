import { useEffect, useState } from 'react'
import { getDebugNow, subscribeDebugClock } from './debugClock'
import { getMapDisplayMode, subscribeMapDisplayMode } from './mapDisplayMode'
import { getSunTint } from './timeOfDay'

const NO_TINT = 'rgba(0, 0, 0, 0)'

function computeTint(): string {
  // El brillo de amanecer/atardecer es parte de la simulación de "hora real" —
  // si el usuario fijó el mapa en oscuro o claro, no aplica.
  if (getMapDisplayMode() !== 'real') return NO_TINT
  return getSunTint(new Date(getDebugNow()))
}

/** Color del filtro de amanecer/atardecer — sin efecto si el modo del mapa no es "Hora real". */
export function useTimeOfDayTint(): string {
  const [tint, setTint] = useState(computeTint)

  useEffect(() => {
    const recompute = () => setTint(computeTint())
    const unsubscribeClock = subscribeDebugClock(recompute)
    const unsubscribeMode = subscribeMapDisplayMode(recompute)
    const interval = setInterval(recompute, 60_000)
    return () => {
      unsubscribeClock()
      unsubscribeMode()
      clearInterval(interval)
    }
  }, [])

  return tint
}
