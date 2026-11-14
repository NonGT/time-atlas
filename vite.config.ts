import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  // maplibre-gl v6 loads its worker from a sibling file, which breaks when Vite pre-bundles it
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
})
