import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Two static entries, retained until Phase 2 (DASHBOARD_SPEC.md §4, v1.10):
//   index.html      -> public dashboard (stub for now)
//   log/index.html  -> authenticated write surface
// Host is Cloudflare Workers (static assets) behind Cloudflare Access
// (v1.9, host updated v1.11). `base` comes from an env var, not a
// hardcoded string, but VITE_BASE_PATH stays unset: the Worker serves
// from the site root, so base resolves to "/".
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || '/',
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          log: resolve(__dirname, 'log/index.html'),
        },
      },
    },
  }
})
