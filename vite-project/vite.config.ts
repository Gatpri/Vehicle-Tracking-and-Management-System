import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Allows the Cloudflare quick-tunnel hostname (random subdomain each
    // run) through Vite's Host-header check, so it's reachable from other
    // devices via the public tunnel URL instead of only localhost.
    allowedHosts: ['.trycloudflare.com'],
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      }
    }
  }
})
