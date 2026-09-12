/** Debajo de este nivel el vehículo se muestra en rojo — se está por quedar sin combustible. */
export const LOW_FUEL_LITERS = 10

/** Toda parada a repostar tarda siempre lo mismo cargando, sin importar cuánto se cargue
 *  (el desvío de ida/vuelta hasta la gasolinera es tiempo APARTE — ver `core/trip.ts`). */
export const REFUEL_STOP_DURATION_MS = 5 * 60 * 1000

/** Costo fijo de llamar a la grúa de asistencia cuando el vehículo se queda varado sin
 *  combustible (`status: 'stranded'`, ver `core/trip.ts`) — se descuenta de la caja de la
 *  empresa una sola vez, sin importar el vehículo; a cambio llena el tanque al toque, sin
 *  espera (ver docs/FUEL_MECHANICS.md). */
export const TOW_TRUCK_COST = 300_000

/** Ir a la velocidad mínima permitida (`MIN_CRUISE_SPEED_KMH`, ver core/vehicle.ts) en vez
 *  de a la de fábrica ahorra como máximo esta fracción del consumo — un 20-25% real de
 *  ahorro por ir más lento, no una caída libre. Ver `effectiveConsumptionPer100Km`. */
const MAX_SPEED_SAVINGS_FRACTION = 0.3

/**
 * Consumo real (L/100km) circulando a `cruiseSpeedKmh`. `baseConsumptionPer100Km`
 * es el consumo del vehículo a su velocidad de fábrica (`ratedSpeedKmh`, su
 * `averageSpeedKmh`) — el valor con el que se lo compró. Ir más lento consume
 * menos, pero con un techo: como mucho `MAX_SPEED_SAVINGS_FRACTION` de ahorro,
 * aunque se vaya al piso del slider (`MIN_CRUISE_SPEED_KMH`). Una caída
 * puramente cuadrática con la velocidad (como haría un modelo de resistencia
 * del aire de manual) suena razonable en la fórmula pero dispara la autonomía
 * a 3-4x con solo bajar la velocidad — un camión con tanque lleno pasaba de
 * ~550km a ~1900km de rango solo por ir a 40km/h en vez de a su velocidad de
 * fábrica, algo que ningún vehículo real logra. En la práctica ir más lento
 * ahorra combustible por motor/aerodinámica, pero no en esa magnitud.
 *
 * A velocidad de fábrica el resultado es exactamente `baseConsumptionPer100Km`;
 * al piso del slider, como mucho un `MAX_SPEED_SAVINGS_FRACTION` menos.
 */
export function effectiveConsumptionPer100Km(
  baseConsumptionPer100Km: number,
  cruiseSpeedKmh: number,
  ratedSpeedKmh: number,
): number {
  const ratio = cruiseSpeedKmh / ratedSpeedKmh
  const savingsFactor = 1 - MAX_SPEED_SAVINGS_FRACTION * (1 - ratio * ratio)
  return baseConsumptionPer100Km * savingsFactor
}

/** Autonomía (km) disponible con `fuelLiters` al consumo efectivo dado. */
export function autonomyKm(fuelLiters: number, consumptionPer100Km: number): number {
  if (consumptionPer100Km <= 0) return Infinity
  return (fuelLiters / consumptionPer100Km) * 100
}

/** Litros que consume recorrer `distanceKm` al consumo efectivo dado. */
export function fuelForDistanceKm(distanceKm: number, consumptionPer100Km: number): number {
  return (distanceKm * consumptionPer100Km) / 100
}
