import { AnimatePresence, motion } from 'framer-motion'

interface AlertModalProps {
  open: boolean
  title: string
  message: string
  onClose: () => void
}

export function AlertModal({ open, title, message, onClose }: AlertModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6 text-center shadow-2xl"
          >
            <div className="text-3xl">⚠️</div>
            <div className="mt-2 text-lg font-semibold text-white">{title}</div>
            <p className="mt-2 text-sm text-neutral-400">{message}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400"
            >
              Entendido
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
