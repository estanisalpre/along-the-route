import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // maplibre-gl gestiona su propio Web Worker vía import.meta.url; el pre-bundling
  // de Vite lo reescribe mal y el worker termina en 404 (el mapa se ve pero el
  // estilo nunca "carga" del todo: sin worker no se pueden parsear tiles vectoriales).
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
