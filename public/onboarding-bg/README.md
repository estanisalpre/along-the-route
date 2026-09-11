# Fondos del onboarding

Poné acá las 5 fotos generadas con los prompts de la conversación, con estos nombres exactos:

- `bg-1.jpg` — Patagonia, Ruta 40
- `bg-2.jpg` — Autopista urbana, Buenos Aires al atardecer
- `bg-3.jpg` — Quebrada de Humahuaca
- `bg-4.jpg` — Pampa húmeda, campos de trigo
- `bg-5.jpg` — Ruta nocturna con lluvia

El carrusel (`src/ui/onboarding/BackgroundCarousel.tsx`) las lee directamente de `/onboarding-bg/bg-N.jpg` y las va rotando cada 5 segundos, con un paneo lento que alterna dirección (izquierda→derecha en las impares, derecha→izquierda en las pares). Si preferís otro formato (`.png`, `.webp`) o nombres, hay que actualizar el array `IMAGES` en ese archivo.
