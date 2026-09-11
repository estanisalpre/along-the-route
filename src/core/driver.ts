import type { LicenseClass } from './license'

export interface Driver {
  id: string
  name: string
  dailySalary: number
  experienceYears: number
  licenses: LicenseClass[]
}

const CANDIDATE_NAMES = [
  'Mirta Gómez',
  'Ramón Acosta',
  'Lucía Ferreyra',
  'Walter Benítez',
  'Noelia Cardozo',
  'Hugo Paz',
  'Silvina Rojas',
  'Facundo Molina',
  'Graciela Suárez',
  'Damián Villalba',
]

// Las licencias son acumulativas: para sacar una más "grande" hace falta
// antigüedad en la anterior (como en la vida real), así que un chofer con más
// años ya trae todas las de abajo.
const LICENSES_BY_EXPERIENCE: LicenseClass[] = ['B1', 'B2', 'C1', 'C2', 'E']

function licensesForExperience(experienceYears: number): LicenseClass[] {
  if (experienceYears >= 9) return LICENSES_BY_EXPERIENCE
  if (experienceYears >= 6) return LICENSES_BY_EXPERIENCE.slice(0, 4)
  if (experienceYears >= 4) return LICENSES_BY_EXPERIENCE.slice(0, 3)
  if (experienceYears >= 2) return LICENSES_BY_EXPERIENCE.slice(0, 2)
  return LICENSES_BY_EXPERIENCE.slice(0, 1)
}

function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items]
  const picked: T[] = []
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(index, 1)[0])
  }
  return picked
}

/** Genera 3 candidatos a chofer con sueldo diario distinto para elegir en el onboarding. */
export function generateDriverCandidates(): Driver[] {
  const names = pickRandom(CANDIDATE_NAMES, 3)
  const salaryTiers = [12_000, 18_000, 25_000]
  const experienceTiers = [1, 4, 9]

  return names.map((name, i) => ({
    id: crypto.randomUUID(),
    name,
    dailySalary: salaryTiers[i],
    experienceYears: experienceTiers[i],
    licenses: licensesForExperience(experienceTiers[i]),
  }))
}

/** Genera candidatos variados para la Agencia (mercado de personal en curso). */
export function generateAgencyCandidates(count: number): Driver[] {
  const names = pickRandom(CANDIDATE_NAMES, Math.min(count, CANDIDATE_NAMES.length))

  return names.map((name) => {
    const experienceYears = 1 + Math.floor(Math.random() * 14)
    const baseSalary = 10_000 + experienceYears * 1_700
    const jitter = Math.round(((Math.random() * 0.2 - 0.1) * baseSalary) / 500) * 500
    return {
      id: crypto.randomUUID(),
      name,
      dailySalary: baseSalary + jitter,
      experienceYears,
      licenses: licensesForExperience(experienceYears),
    }
  })
}
