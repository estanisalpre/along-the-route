export interface Country {
  code: string
  name: string
  flag: string
}

// Sudamérica. Orden aproximado norte -> sur. Cuáles están realmente jugables
// depende de si existe su archivo en src/map/by_country/<code>.json (ver core/cities.ts).
export const SOUTH_AMERICAN_COUNTRIES: Country[] = [
  { code: 've', name: 'Venezuela', flag: '🇻🇪' },
  { code: 'co', name: 'Colombia', flag: '🇨🇴' },
  { code: 'ec', name: 'Ecuador', flag: '🇪🇨' },
  { code: 'pe', name: 'Perú', flag: '🇵🇪' },
  { code: 'br', name: 'Brasil', flag: '🇧🇷' },
  { code: 'bo', name: 'Bolivia', flag: '🇧🇴' },
  { code: 'py', name: 'Paraguay', flag: '🇵🇾' },
  { code: 'cl', name: 'Chile', flag: '🇨🇱' },
  { code: 'uy', name: 'Uruguay', flag: '🇺🇾' },
  { code: 'ar', name: 'Argentina', flag: '🇦🇷' },
]
