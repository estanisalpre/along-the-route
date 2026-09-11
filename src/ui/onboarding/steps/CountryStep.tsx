import { motion } from 'framer-motion'
import { getAvailableCountryCodes } from '../../../core/cities'
import { SOUTH_AMERICAN_COUNTRIES } from '../../../core/countries'

interface CountryStepProps {
  countryCode: string | null
  loading: boolean
  onSelect: (code: string) => void
}

export function CountryStep({ countryCode, loading, onSelect }: CountryStepProps) {
  const available = new Set(getAvailableCountryCodes())

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">¿En qué país arrancás?</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Por ahora, Sudamérica. El resto de los países va a ir sumándose más adelante.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
        {SOUTH_AMERICAN_COUNTRIES.map((country) => {
          const isAvailable = available.has(country.code)
          const isSelected = countryCode === country.code

          return (
            <motion.button
              key={country.code}
              type="button"
              disabled={!isAvailable}
              whileHover={isAvailable ? { y: -2 } : undefined}
              onClick={() => onSelect(country.code)}
              className={`rounded-xl border p-4 text-center transition-colors ${
                isSelected
                  ? 'border-orange-500 bg-orange-500/10'
                  : isAvailable
                    ? 'border-neutral-700 bg-neutral-800 hover:border-neutral-500'
                    : 'cursor-not-allowed border-neutral-800 bg-neutral-900/50 opacity-40'
              }`}
            >
              <div className="text-3xl">{country.flag}</div>
              <div className="mt-1 text-sm text-white">{country.name}</div>
              {!isAvailable && <div className="mt-1 text-[10px] text-neutral-500">Próximamente</div>}
              {isSelected && loading && <div className="mt-1 text-[10px] text-orange-400">Cargando ciudades...</div>}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
