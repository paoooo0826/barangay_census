import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/barangay-census/',
  resolve: {
    // face-api.js contains an unused Node.js filesystem fallback. Point it to
    // a browser-safe stub so Vite does not externalize Node's `fs` module.
    alias: {
      fs: fileURLToPath(new URL('./src/shims/fs.ts', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1400,
  },
})
