import { defineConfig, devices } from '@playwright/test'

/**
 * E2E contro lo stack Supabase LOCALE reale (Auth, PostgREST, Postgres, RLS).
 * Avvio: `npm run db:start`, poi `npm run test:e2e:local` (che inietta URL e
 * chiavi locali tramite scripts/with-local-supabase.mjs).
 */
const APP_PORT = 3101

if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http://127.0.0.1')) {
  throw new Error('playwright.local.config.ts gira solo contro lo stack Supabase locale (npm run test:e2e:local).')
}

export default defineConfig({
  testDir: 'tests/e2e/local',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${APP_PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${APP_PORT}/login`,
    env: { NEXT_DIST_DIR: '.next-e2e-local', NEXT_TELEMETRY_DISABLED: '1' },
    timeout: 300_000,
    reuseExistingServer: false,
  },
})
