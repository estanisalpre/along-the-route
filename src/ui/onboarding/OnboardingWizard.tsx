import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { loadCountryCities } from '../../core/cities'
import type { Company } from '../../core/company'
import { generateDriverCandidates, type Driver } from '../../core/driver'
import { formatArs } from '../../core/format'
import { GARAGE_TIERS } from '../../core/garage'
import { LOAN_OPTIONS, createLoan } from '../../core/loan'
import { LOGOS } from '../../core/logos'
import { VEHICLE_CATALOG, type VehicleType } from '../../core/vehicle'
import { BackgroundCarousel } from './BackgroundCarousel'
import { CountryStep } from './steps/CountryStep'
import { DriverStep } from './steps/DriverStep'
import { GarageStep } from './steps/GarageStep'
import { ProfileStep } from './steps/ProfileStep'
import { SummaryStep } from './steps/SummaryStep'
import { VehicleStep } from './steps/VehicleStep'

const STEP_TITLES = ['País', 'Perfil', 'Sede', 'Chofer', 'Vehículo', 'Resumen']

interface OnboardingWizardProps {
  onComplete: (company: Company) => void
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)

  const [countryCode, setCountryCode] = useState<string | null>(null)
  const [loadingCountry, setLoadingCountry] = useState(false)

  const [ownerName, setOwnerName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [logoId, setLogoId] = useState<string | null>(null)
  const [loanOptionId, setLoanOptionId] = useState<string | null>(null)
  const [cityId, setCityId] = useState<string | null>(null)
  const [driverCandidates] = useState<Driver[]>(() => generateDriverCandidates())
  const [driverId, setDriverId] = useState<string | null>(null)
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null)

  const loanOption = LOAN_OPTIONS.find((o) => o.id === loanOptionId) ?? null
  const garageTier = GARAGE_TIERS[0]
  const vehicleSpec = VEHICLE_CATALOG.find((v) => v.type === vehicleType) ?? null

  const cash = useMemo(() => {
    let value = loanOption?.principal ?? 0
    if (cityId) value -= garageTier.cost
    if (vehicleSpec) value -= vehicleSpec.purchaseCost
    return value
  }, [loanOption, cityId, vehicleSpec, garageTier.cost])

  const canAdvance = [
    Boolean(countryCode) && !loadingCountry,
    Boolean(ownerName.trim() && companyName.trim() && logoId && loanOptionId),
    Boolean(cityId),
    Boolean(driverId),
    Boolean(vehicleType),
    true,
  ][step]

  async function handleSelectCountry(code: string) {
    setLoadingCountry(true)
    try {
      await loadCountryCities(code)
      setCountryCode(code)
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingCountry(false)
    }
  }

  const isLastStep = step === STEP_TITLES.length - 1

  function handlePrimaryAction() {
    if (!isLastStep) {
      setStep((s) => s + 1)
      return
    }

    const now = Date.now()
    const driver = driverCandidates.find((d) => d.id === driverId)!
    const company: Company = {
      id: crypto.randomUUID(),
      ownerName: ownerName.trim(),
      companyName: companyName.trim(),
      logoId: logoId!,
      countryCode: countryCode!,
      cash,
      loan: createLoan(loanOption!, now),
      garages: [{ id: crypto.randomUUID(), tierId: garageTier.id, cityId: cityId!, fuelLiters: 0 }],
      drivers: [driver],
      vehicles: [
        {
          id: crypto.randomUUID(),
          type: vehicleSpec!.type,
          averageSpeedKmh: vehicleSpec!.averageSpeedKmh,
          capacityKg: vehicleSpec!.capacityKg,
          currentCityId: cityId!,
          status: 'available',
          driverId: driver.id,
          condition: 'nuevo',
          mechanicalCondition: 100,
          fuelConsumptionPer100Km: vehicleSpec!.fuelConsumptionPer100Km,
          tankCapacityLiters: vehicleSpec!.tankCapacityLiters,
          currentFuelLiters: vehicleSpec!.tankCapacityLiters,
          cruiseSpeedKmh: vehicleSpec!.averageSpeedKmh,
          refuelTargetLiters: vehicleSpec!.tankCapacityLiters,
        },
      ],
      trips: [],
      fuelPriceHistory: [],
      createdAt: now,
    }
    onComplete(company)
  }

  const selectedLogo = LOGOS.find((l) => l.id === logoId)

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-y-auto px-4 py-8">
      <BackgroundCarousel />
      <div className="relative w-full max-w-3xl">
        {/* Header: logo/empresa + efectivo disponible */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedLogo && (
              <motion.div
                layoutId="company-logo"
                className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-lg ${selectedLogo.gradient}`}
              >
                {selectedLogo.emoji}
              </motion.div>
            )}
            <span className="text-lg font-semibold text-white">{companyName || 'Por la Ruta'}</span>
          </div>
          {loanOption && (
            <div className="text-right">
              <div className="text-xs text-neutral-400">Efectivo disponible</div>
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={cash}
                  initial={{ opacity: 0, y: -6, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="font-mono text-lg font-semibold text-emerald-400"
                >
                  {formatArs(cash)}
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Barra de progreso */}
        <div className="mb-8 flex items-center gap-2">
          {STEP_TITLES.map((title, i) => (
            <div key={title} className="flex flex-1 items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    i < step
                      ? 'bg-orange-500 text-white'
                      : i === step
                        ? 'bg-orange-500/20 text-orange-400 ring-2 ring-orange-500'
                        : 'bg-neutral-800 text-neutral-500'
                  }`}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`text-[10px] ${i <= step ? 'text-neutral-300' : 'text-neutral-600'}`}>{title}</span>
              </div>
              {i < STEP_TITLES.length - 1 && (
                <div className={`h-0.5 flex-1 rounded ${i < step ? 'bg-orange-500' : 'bg-neutral-800'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Contenido animado del paso actual */}
        <div className="rounded-2xl border border-neutral-700/60 bg-neutral-900/70 p-6 shadow-2xl backdrop-blur-md">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }}
            >
              {step === 0 && (
                <CountryStep countryCode={countryCode} loading={loadingCountry} onSelect={(code) => void handleSelectCountry(code)} />
              )}
              {step === 1 && (
                <ProfileStep
                  draft={{ ownerName, companyName, logoId, loanOptionId }}
                  onChange={(d) => {
                    setOwnerName(d.ownerName)
                    setCompanyName(d.companyName)
                    setLogoId(d.logoId)
                    setLoanOptionId(d.loanOptionId)
                  }}
                />
              )}
              {step === 2 && <GarageStep draft={{ cityId }} onChange={(d) => setCityId(d.cityId)} />}
              {step === 3 && (
                <DriverStep candidates={driverCandidates} selectedDriverId={driverId} onSelect={setDriverId} />
              )}
              {step === 4 && <VehicleStep selectedType={vehicleType} onSelect={setVehicleType} />}
              {step === 5 && loanOption && cityId && (
                <SummaryStep
                  ownerName={ownerName}
                  companyName={companyName}
                  logoId={logoId!}
                  loanOption={loanOption}
                  cityId={cityId}
                  driver={driverCandidates.find((d) => d.id === driverId)!}
                  vehicleType={vehicleType!}
                  finalCash={cash}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navegación */}
        <div className="mt-6 flex justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-lg px-4 py-2 text-sm text-neutral-400 transition-colors hover:text-white disabled:opacity-0"
          >
            ← Atrás
          </button>
          <motion.button
            type="button"
            whileHover={canAdvance ? { scale: 1.03 } : undefined}
            whileTap={canAdvance ? { scale: 0.97 } : undefined}
            disabled={!canAdvance}
            onClick={handlePrimaryAction}
            className={`rounded-lg px-6 py-2.5 text-sm font-semibold shadow-lg transition-colors ${
              canAdvance
                ? 'bg-orange-500 text-white hover:bg-orange-400'
                : 'cursor-not-allowed bg-neutral-800 text-neutral-600'
            }`}
          >
            {isLastStep ? '🚀 Comenzar a operar' : 'Siguiente →'}
          </motion.button>
        </div>
      </div>
    </div>
  )
}
