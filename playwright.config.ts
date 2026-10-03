import { defineConfig, devices } from '@playwright/test'

/**
 * E2E contro una build di produzione reale (`.next-e2e`) collegata a un finto
 * Supabase Auth locale (tests/e2e/mock-supabase.mjs). Nessun servizio esterno.
 */
const APP_PORT = 3100
const MOCK_PORT = 54399

const appEnv = {
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'e2e-publishable-key-not-a-real-key',
}

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node tests/e2e/mock-supabase.mjs',
      url: `http://127.0.0.1:${MOCK_PORT}/__health`,
      env: { MOCK_SUPABASE_PORT: String(MOCK_PORT) },
      reuseExistingServer: false,
    },
    {
      command: `npx next build && npx next start -p ${APP_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${APP_PORT}/login`,
      env: appEnv,
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
})
