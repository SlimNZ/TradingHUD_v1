import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /hl-api/* is proxied to the public Hyperliquid info API so the browser
// never hits CORS in local dev. Production builds call the API directly;
// if that ever gets blocked, front it with a tiny proxy on the same path.
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built site works at any URL — GitHub Pages
  // project subpath (…/TradingHUD_v1/), a custom domain, or opened locally.
  base: './',
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
