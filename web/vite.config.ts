import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Two static entries, no client router (DASHBOARD_SPEC.md §4):
//   index.html      -> public dashboard (stub for now)
//   log/index.html  -> authenticated write surface
// `base` comes from an env var, not a hardcoded string, so the same build
// works locally (default "/") and under the repo's GitHub Pages subpath.
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
