/** Debajo de este nivel el vehículo se muestra en rojo — se está por quedar sin combustible. */
export const LOW_FUEL_LITERS = 10

/** Toda parada a repostar tarda siempre lo mismo, sin importar cuánto se cargue. */
export const REFUEL_STOP_DURATION_MS = 5 * 60 * 1000

/**
 * Consumo real (L/100km) circulando a `cruiseSpeedKmh`. `baseConsumptionPer100Km`
 * es el consumo del vehículo a su velocidad de fábrica (`ratedSpeedKmh`, su
 * `averageSpeedKmh`) — el valor con el que se lo compró. Ir más lento consume
 * menos: se aproxima con una caída cuadrática de la velocidad (la energía
 * para vencer la resistencia del aire por km recorrido escala más o menos
 * con el cuadrado de la velocidad). No es un simulador físico real — solo
 * necesitamos que "más lento = más eficiente" sea cierto y reaccione al
 * slider de velocidad de forma creíble.
 *
 * A velocidad de fábrica el resultado es exactamente `baseConsumptionPer100Km`;
 * a la mitad de la velocidad, un cuarto del consumo (el doble de autonomía
 * con los mismos litros ya sería mucho — así se nota bien la decisión).
 */
export function effectiveConsumptionPer100Km(
  baseConsumptionPer100Km: number,
  cruiseSpeedKmh: number,
  ratedSpeedKmh: number,
): number {
  const ratio = cruiseSpeedKmh / ratedSpeedKmh
  return baseConsumptionPer100Km * ratio * ratio
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
