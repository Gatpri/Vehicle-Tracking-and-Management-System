import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Read the single consolidated .env at the repo root instead of a separate
  // copy inside vite-project. Only VITE_-prefixed keys are exposed to the
  // browser bundle, so co-locating them with backend secrets is safe — the
  // server-side keys in that file are never inlined into client code.
  envDir: fileURLToPath(new URL('..', import.meta.url)),
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
      // No rewrite: the backend itself mounts every router under /api
      // (see backend_api/index.js), matching what nginx serves in Docker.
      // Stripping the prefix here would forward /api/register as /register,
      // which the backend no longer has a route for.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
