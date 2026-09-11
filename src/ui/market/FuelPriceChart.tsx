import { useState } from 'react'
import { formatArs } from '../../core/format'
import type { FuelPriceEntry } from '../../core/fuelPrice'

const WIDTH = 640
const HEIGHT = 200
const PADDING = { top: 16, right: 12, bottom: 24, left: 12 }

// Paleta de la skill de dataviz (referencia validada, modo oscuro).
const COLOR_LINE = '#3987e5'
const COLOR_GRIDLINE = '#2c2c2a'
const COLOR_AXIS_TEXT = '#898781'
const COLOR_CROSSHAIR = '#52514e'
const COLOR_SURFACE = '#1a1a19'

function formatHour(timestamp: number): string {
  return `${new Date(timestamp).getHours().toString().padStart(2, '0')}:00`
}

export function FuelPriceChart({ history }: { history: FuelPriceEntry[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  if (history.length < 2) return null

  const prices = history.map((h) => h.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const pad = (maxPrice - minPrice) * 0.15 || maxPrice * 0.1
  const yMin = Math.max(0, minPrice - pad)
  const yMax = maxPrice + pad

  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom

  const xFor = (i: number) => PADDING.left + (i / (history.length - 1)) * plotWidth
  const yFor = (price: number) => PADDING.top + (1 - (price - yMin) / (yMax - yMin)) * plotHeight

  const pathD = history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(h.price).toFixed(1)}`).join(' ')
  const gridTicks = [yMax, (yMin + yMax) / 2, yMin]
  const hovered = hoverIndex !== null ? history[hoverIndex] : null
  const last = history[history.length - 1]

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH
    const idx = Math.round(((relX - PADDING.left) / plotWidth) * (history.length - 1))
    setHoverIndex(Math.min(history.length - 1, Math.max(0, idx)))
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {gridTicks.map((price) => (
          <line
            key={price}
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={yFor(price)}
            y2={yFor(price)}
            stroke={COLOR_GRIDLINE}
            strokeWidth={1}
          />
        ))}

        <path d={pathD} fill="none" stroke={COLOR_LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {history.map(
          (h, i) =>
            i % 3 === 0 && (
              <text key={h.hourTimestamp} x={xFor(i)} y={HEIGHT - 6} fontSize={9} fill={COLOR_AXIS_TEXT} textAnchor="middle">
                {formatHour(h.hourTimestamp)}
              </text>
            ),
        )}

        {/* marcador del precio actual (último punto) */}
        <circle cx={xFor(history.length - 1)} cy={yFor(last.price)} r={5} fill={COLOR_LINE} stroke={COLOR_SURFACE} strokeWidth={2} />

        {hovered && hoverIndex !== null && (
          <>
            <line
              x1={xFor(hoverIndex)}
              x2={xFor(hoverIndex)}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke={COLOR_CROSSHAIR}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <circle cx={xFor(hoverIndex)} cy={yFor(hovered.price)} r={5} fill={COLOR_LINE} stroke={COLOR_SURFACE} strokeWidth={2} />
          </>
        )}
      </svg>

      {hovered && hoverIndex !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded bg-neutral-800 px-2 py-1 text-xs whitespace-nowrap shadow-lg"
          style={{ left: `${(xFor(hoverIndex) / WIDTH) * 100}%`, top: `${(yFor(hovered.price) / HEIGHT) * 100 - 2}%` }}
        >
          <div className="font-semibold text-white">{formatArs(hovered.price)}</div>
          <div className="text-neutral-400">{formatHour(hovered.hourTimestamp)}</div>
        </div>
      )}
    </div>
  )
}
