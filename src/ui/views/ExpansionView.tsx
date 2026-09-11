import { useState } from 'react'
import type { Company } from '../../core/company'
import type { VehicleListing } from '../../core/vehicleListing'
import { FleetMarket } from '../market/FleetMarket'
import { GarageMarketMap } from '../market/GarageMarketMap'

type ExpansionTab = 'garages' | 'flota'

interface ExpansionViewProps {
  company: Company
  onBuyGarage: (cityId: string) => void
  onBuyVehicle: (listing: VehicleListing) => void
}

export function ExpansionView({ company, onBuyGarage, onBuyVehicle }: ExpansionViewProps) {
  const [tab, setTab] = useState<ExpansionTab>('garages')

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('garages')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === 'garages' ? 'bg-orange-500 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          🏠 Garages
        </button>
        <button
          type="button"
          onClick={() => setTab('flota')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === 'flota' ? 'bg-orange-500 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          🚚 Flota
        </button>
      </div>

      {tab === 'garages' && (
        <GarageMarketMap ownedCityIds={company.garages.map((g) => g.cityId)} cash={company.cash} onBuy={onBuyGarage} />
      )}
      {tab === 'flota' && <FleetMarket cash={company.cash} onBuy={onBuyVehicle} />}
    </div>
  )
}
