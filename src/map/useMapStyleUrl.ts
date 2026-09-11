import { useEffect, useState } from 'react'
import { getDebugNow, subscribeDebugClock } from './debugClock'
import { getMapDisplayMode, subscribeMapDisplayMode } from './mapDisplayMode'
import { DAY_STYLE, getMapStyleUrl, NIGHT_STYLE } from './timeOfDay'

function computeStyleUrl(): string {
  const mode = getMapDisplayMode()
  if (mode === 'dark') return NIGHT_STYLE
  if (mode === 'light') return DAY_STYLE
  return getMapStyleUrl(new Date(getDebugNow()))
}

/** URL del estilo día/noche — o fijo si el usuario eligió "Oscuro"/"Claro" en el menú del mapa. */
export function useMapStyleUrl(): string {
  const [url, setUrl] = useState(computeStyleUrl)

  useEffect(() => {
    const recompute = () => setUrl(computeStyleUrl())
    const unsubscribeClock = subscribeDebugClock(recompute)
    const unsubscribeMode = subscribeMapDisplayMode(recompute)
    const interval = setInterval(recompute, 60_000)
    return () => {
      unsubscribeClock()
      unsubscribeMode()
      clearInterval(interval)
    }
  }, [])

  return url
}
