import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Test di integrazione contro lo stack Supabase locale (npm run test:integration). */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: { TZ: 'America/Los_Angeles' },
  },
})
