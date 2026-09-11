import { motion } from 'framer-motion'
import { CITIES } from '../../core/cities'
import { formatArs } from '../../core/format'
import { GAS_STATION_BRANDS, getGasStationPrice, type GasStation } from '../../core/gasStation'
import type { FuelPriceEntry } from '../../core/fuelPrice'

interface GasStationPanelProps {
  gasStation: GasStation
  fuelPriceHistory: FuelPriceEntry[]
  onCenter: () => void
  onClose: () => void
}

export function GasStationPanel({ gasStation, fuelPriceHistory, onCenter, onClose }: GasStationPanelProps) {
  const color = GAS_STATION_BRANDS.find((b) => b.id === gasStation.brand)?.color ?? '#999999'
  const nearCity = CITIES.find((c) => c.id === gasStation.nearCityId)
  const pricePerLiter = getGasStationPrice(fuelPriceHistory)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      className="w-72 rounded-xl border border-neutral-700 bg-neutral-900/95 p-4 shadow-2xl backdrop-blur-sm"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-black"
            style={{ backgroundColor: color }}
          >
            ⛽
          </div>
          <div>
            <div className="font-semibold text-white">{gasStation.brand}</div>
            {nearCity && <div className="text-xs text-neutral-500">Cerca de {nearCity.name}</div>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
          ✕
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-3 text-sm">
        <span className="text-neutral-400">Precio por litro</span>
        <span className="font-semibold text-white">{formatArs(pricePerLiter)}</span>
      </div>
      <div className="mt-1 text-xs text-neutral-500">
        Siempre 10% más caro que cargar en tu garage — conviene evitarlo si se puede.
      </div>

      <button
        type="button"
        onClick={onCenter}
        className="mt-3 w-full rounded border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-orange-500 hover:text-orange-400"
      >
        ⌖ Centrar
      </button>
    </motion.div>
  )
}
