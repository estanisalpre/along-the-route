// Hash determinista (no criptográfico) compartido por todo lo que necesita
// "aleatoriedad" reproducible: mismo seed siempre da el mismo resultado, sin
// importar cuándo se llame ni quién lo llame — así el precio del combustible
// (fuelPrice.ts), la ubicación de las gasolineras (gasStation.ts) y el
// mercado de cargas (cargoMarket.ts) dan siempre lo mismo para cualquiera
// que juegue en el mismo momento, en vez de depender de `Math.random()`.

/** Mismo seed siempre da el mismo número en [0,1). */
export function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 43_758.5453123
  return x - Math.floor(x)
}

/** Hash simple de un string a un entero, para usar como seed. */
export function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0
  return hash
}
