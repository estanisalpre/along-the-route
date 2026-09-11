/** Minúsculas y sin tildes/diacríticos, para que "cordoba" matchee "Córdoba". */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
