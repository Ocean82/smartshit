import { defineConfig, devices } from '@playwright/test'

/**
 * Chromium-only E2E against the built app (vite preview).
 * Clerk is off when VITE_CLERK_PUBLISHABLE_KEY is unset at build time.
 * baseURL includes `/app/` to match vite.config.ts `base`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173/app/',
    trace: 'on-first-retry',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Rebuild without Clerk so AuthGate does not hang on the placeholder
    // VITE_CLERK_PUBLISHABLE_KEY in .env.production.
    command: 'npm run build:e2e && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/app/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
