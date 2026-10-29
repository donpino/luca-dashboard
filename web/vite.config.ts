import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Two static entries (DASHBOARD_SPEC.md §4). Since v1.43 both render the
// same App — index.html opened on Today, log/index.html on the Log tab, so
// the old /log/ address keeps working; the Supabase write path is a lazy
// chunk either way.
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
