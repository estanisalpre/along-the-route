import { motion } from 'framer-motion'
import { DebugClock } from './DebugClock'

export type MainView = 'mapa' | 'mercado' | 'garages' | 'personal' | 'expansion'

const TABS: { id: MainView; label: string }[] = [
  { id: 'mapa', label: 'Mapa' },
  { id: 'mercado', label: 'Mercado' },
  { id: 'garages', label: 'Mis garages' },
  { id: 'personal', label: 'Personal' },
  { id: 'expansion', label: 'Expansión' },
]

interface NavBarProps {
  active: MainView
  onChange: (view: MainView) => void
}

export function NavBar({ active, onChange }: NavBarProps) {
  return (
    <nav className="flex gap-1 border-b border-neutral-800 bg-neutral-900 px-4">
      {TABS.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative px-4 py-3 text-sm font-medium transition-colors ${
              isActive ? 'text-orange-500' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {tab.label}
            {isActive && (
              <motion.div layoutId="nav-underline" className="absolute inset-x-2 -bottom-px h-0.5 bg-orange-500" />
            )}
          </button>
        )
      })}
      <DebugClock />
    </nav>
  )
}
