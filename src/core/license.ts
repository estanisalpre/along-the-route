export type LicenseClass = 'B1' | 'B2' | 'C1' | 'C2' | 'E'

export interface LicenseInfo {
  id: LicenseClass
  name: string
  description: string
}

// Basado en la Licencia Nacional de Conducir argentina (Ley 24.449).
export const LICENSES: Record<LicenseClass, LicenseInfo> = {
  B1: { id: 'B1', name: 'B1', description: 'Utilitarios y camionetas hasta 3.500 kg' },
  B2: { id: 'B2', name: 'B2', description: 'Como B1, con acoplado de hasta 750 kg' },
  C1: { id: 'C1', name: 'C1', description: 'Camiones sin acoplado de 3.500 a 12.000 kg' },
  C2: { id: 'C2', name: 'C2', description: 'Camiones sin acoplado de 12.000 a 24.000 kg' },
  E: { id: 'E', name: 'E', description: 'Camiones articulados o con acoplado (semirremolque)' },
}
