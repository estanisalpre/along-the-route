export interface Logo {
  id: string
  emoji: string
  gradient: string
}

// Placeholders simples (emoji + degradé) hasta tener arte propio de logos.
export const LOGOS: Logo[] = [
  { id: 'truck', emoji: '🚛', gradient: 'from-orange-500 to-red-600' },
  { id: 'road', emoji: '🛣️', gradient: 'from-slate-500 to-slate-800' },
  { id: 'star', emoji: '⭐', gradient: 'from-amber-400 to-yellow-600' },
  { id: 'mountain', emoji: '🏔️', gradient: 'from-sky-500 to-blue-700' },
  { id: 'sunset', emoji: '🌅', gradient: 'from-pink-500 to-orange-500' },
  { id: 'eagle', emoji: '🦅', gradient: 'from-stone-600 to-neutral-800' },
  { id: 'horse', emoji: '🐎', gradient: 'from-amber-700 to-yellow-900' },
  { id: 'bolt', emoji: '⚡', gradient: 'from-yellow-400 to-amber-600' },
  { id: 'shield', emoji: '🛡️', gradient: 'from-emerald-500 to-teal-700' },
  { id: 'compass', emoji: '🧭', gradient: 'from-cyan-500 to-indigo-600' },
]
