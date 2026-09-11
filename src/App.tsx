import { useEffect, useState } from 'react'
import { loadCountryCities } from './core/cities'
import { loadCompany, saveCompany, type Company } from './core/company'
import { Dashboard } from './ui/dashboard/Dashboard'
import { OnboardingWizard } from './ui/onboarding/OnboardingWizard'

function App() {
  const [company, setCompany] = useState<Company | null>(() => loadCompany())
  // Si ya había una empresa guardada, hace falta cargar las ciudades de SU país
  // antes de mostrar el dashboard — CITIES se usa de forma síncrona en todos
  // lados, así que tiene que estar listo antes del primer render del mapa.
  const [citiesReady, setCitiesReady] = useState(!company)

  useEffect(() => {
    if (!company) return
    let cancelled = false
    loadCountryCities(company.countryCode).finally(() => {
      if (!cancelled) setCitiesReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [company])

  if (!company) {
    return (
      <OnboardingWizard
        onComplete={(newCompany) => {
          saveCompany(newCompany)
          setCompany(newCompany)
          setCitiesReady(true)
        }}
      />
    )
  }

  if (!citiesReady) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Cargando el mapa...
      </div>
    )
  }

  return <Dashboard initialCompany={company} />
}

export default App
