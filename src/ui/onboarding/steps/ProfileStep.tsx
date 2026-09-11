import { motion } from 'framer-motion'
import { formatArs } from '../../../core/format'
import { LOAN_OPTIONS, quoteLoan } from '../../../core/loan'
import { LOGOS } from '../../../core/logos'

export interface ProfileDraft {
  ownerName: string
  companyName: string
  logoId: string | null
  loanOptionId: string | null
}

interface ProfileStepProps {
  draft: ProfileDraft
  onChange: (draft: ProfileDraft) => void
}

export function ProfileStep({ draft, onChange }: ProfileStepProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-white">Contanos quién sos</h2>
        <p className="mt-1 text-sm text-neutral-400">Vas a fundar tu propia empresa de transporte por rutas argentinas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-300">Tu nombre</span>
          <input
            value={draft.ownerName}
            onChange={(e) => onChange({ ...draft, ownerName: e.target.value })}
            placeholder="Ej: Esteban Salinas"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-300">Nombre de la empresa de transporte</span>
          <input
            value={draft.companyName}
            onChange={(e) => onChange({ ...draft, companyName: e.target.value })}
            placeholder="Ej: Transportes del Sur"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
        </label>
      </div>

      <div>
        <span className="mb-2 block text-sm text-neutral-300">Elegí el logo de tu empresa</span>
        <div className="grid grid-cols-5 gap-3">
          {LOGOS.map((logo) => {
            const selected = draft.logoId === logo.id
            return (
              <motion.button
                key={logo.id}
                type="button"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onChange({ ...draft, logoId: logo.id })}
                className={`flex aspect-square items-center justify-center rounded-xl bg-gradient-to-br text-2xl shadow-md transition-shadow ${logo.gradient} ${
                  selected ? 'ring-4 ring-orange-400 ring-offset-2 ring-offset-neutral-900' : ''
                }`}
              >
                {logo.emoji}
              </motion.button>
            )
          })}
        </div>
      </div>

      <div>
        <span className="mb-2 block text-sm text-neutral-300">
          Pedí un préstamo inicial al banco (se devuelve con una cuota diaria)
        </span>
        <div className="grid gap-3 sm:grid-cols-3">
          {LOAN_OPTIONS.map((option) => {
            const { totalToRepay, dailyQuota } = quoteLoan(option)
            const selected = draft.loanOptionId === option.id
            return (
              <motion.button
                key={option.id}
                type="button"
                layout
                whileHover={{ y: -2 }}
                onClick={() => onChange({ ...draft, loanOptionId: option.id })}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-neutral-700 bg-neutral-800 hover:border-neutral-500'
                }`}
              >
                <div className="text-lg font-semibold text-white">{formatArs(option.principal)}</div>
                <div className="mt-2 space-y-1 text-xs text-neutral-400">
                  <div>Interés: {(option.interestRate * 100).toFixed(0)}%</div>
                  <div>Plazo: {option.termDays} días</div>
                  <div className="text-neutral-300">Total a devolver: {formatArs(totalToRepay)}</div>
                  <div className="font-medium text-orange-400">Cuota diaria: {formatArs(dailyQuota)}</div>
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
