import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /hl-api/* is proxied to the public Hyperliquid info API so the browser
// never hits CORS in local dev. Production builds call the API directly;
// if that ever gets blocked, front it with a tiny proxy on the same path.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/hl-api': {
        target: 'https://api.hyperliquid.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hl-api/, ''),
      },
    },
  },
})
