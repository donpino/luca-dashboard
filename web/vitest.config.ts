import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts: the app build's two-entry rollup input has
// nothing to do with running unit tests. Tests target pure functions only,
// so no DOM environment (jsdom) is needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
