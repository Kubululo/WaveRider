import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // Relative asset paths so the production build runs when served from any
  // directory root — including the downloadable release zip served by its
  // local launcher (see packaging/) and most static hosts.
  base: './',
  // `compiler: 'vue3'` makes `~icons/<collection>/<name>` imports resolve to
  // inlined SVG components at build time (tree-shaken, no runtime icon lib).
  plugins: [vue(), tailwindcss(), Icons({ compiler: 'vue3' })],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
