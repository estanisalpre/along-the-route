import { useEffect, useState } from 'react'
import { getDebugNow, shiftDebugClock, subscribeDebugClock } from '../../map/debugClock'

const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

interface TimeSegmentProps {
  value: number
  onIncrement: () => void
  onDecrement: () => void
  label: string
}

function TimeSegment({ value, onIncrement, onDecrement, label }: TimeSegmentProps) {
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onIncrement}
        className="leading-none text-neutral-500 hover:text-white"
        aria-label={`Adelantar ${label}`}
      >
        ▲
      </button>
      <span className="w-5 text-center font-mono text-sm text-neutral-200">{value.toString().padStart(2, '0')}</span>
      <button
        type="button"
        onClick={onDecrement}
        className="leading-none text-neutral-500 hover:text-white"
        aria-label={`Atrasar ${label}`}
      >
        ▼
      </button>
    </div>
  )
}

/**
 * Reloj de debug: muestra la hora real del sistema, pero se puede correr
 * hacia adelante/atrás (por hora y por minuto por separado) para probar el
 * filtro de amanecer/atardecer y el cambio de estilo día/noche sin esperar a
 * que sea esa hora de verdad. El corrimiento es fijo (el reloj sigue andando
 * desde ahí), no "congela" el tiempo.
 */
export function DebugClock() {
  const [now, setNow] = useState(() => getDebugNow())

  useEffect(() => {
    const recompute = () => setNow(getDebugNow())
    const unsubscribe = subscribeDebugClock(recompute)
    const interval = setInterval(recompute, 1000)
    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  const date = new Date(now)

  return (
    <div
      className="ml-auto flex items-center gap-1"
      title="Reloj de debug: adelanta/atrasa para probar el mapa de día y de noche"
    >
      <TimeSegment
        value={date.getHours()}
        label="una hora"
        onIncrement={() => shiftDebugClock(HOUR_MS)}
        onDecrement={() => shiftDebugClock(-HOUR_MS)}
      />
      <span className="pb-4 text-neutral-500">:</span>
      <TimeSegment
        value={date.getMinutes()}
        label="un minuto"
        onIncrement={() => shiftDebugClock(MINUTE_MS)}
        onDecrement={() => shiftDebugClock(-MINUTE_MS)}
      />
    </div>
  )
}
