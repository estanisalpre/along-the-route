import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

// Colocá acá las 5 fotos generadas con los prompts (mismo nombre de archivo).
const IMAGES = [
  '/onboarding-bg/bg-1.jpg',
  '/onboarding-bg/bg-2.jpg',
  '/onboarding-bg/bg-3.jpg',
  '/onboarding-bg/bg-4.jpg',
  '/onboarding-bg/bg-5.jpg',
]

const INTERVAL_MS = 5000

export function BackgroundCarousel() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setIndex((i) => (i + 1) % IMAGES.length), INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  // Alterna la dirección del paneo (Ken Burns) entre imagen e imagen: izquierda→derecha, derecha→izquierda...
  const panLeftToRight = index % 2 === 0

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-neutral-950">
      <AnimatePresence>
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 1.12, x: panLeftToRight ? '-2%' : '2%' }}
          animate={{ opacity: 1, scale: 1.12, x: panLeftToRight ? '2%' : '-2%' }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 1.4, ease: 'easeInOut' },
            x: { duration: INTERVAL_MS / 1000, ease: 'linear' },
          }}
          // scale > 1 deja "margen" de imagen fuera de cuadro para que el paneo
          // horizontal nunca revele un borde vacío.
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${IMAGES[index]})` }}
        />
      </AnimatePresence>
      {/* Degradé sutil: el panel del wizard ya tiene su propio fondo con blur,
          así que acá alcanza con oscurecer un poco los bordes para legibilidad
          sin tapar demasiado la foto. */}
      <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/55 via-neutral-950/35 to-neutral-950/70" />
    </div>
  )
}
