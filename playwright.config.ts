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
  projects: [
    {
      name: 'chromium',
      testIgnore: /anon\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Anonymous mode: built with a Clerk key whose host never resolves.
      name: 'anon',
      testMatch: /anon\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174/app/' },
    },
  ],
  globalSetup: './e2e/anon.globalSetup.ts',
  webServer: {
    // One entry builds dist (no Clerk) then dist-anon (unreachable Clerk) in
    // sequence and serves them on 4173 / 4174. Never reuse a stray preview
    // server: it would skip the anon build.
    command: 'node scripts/e2e-servers.mjs',
    url: 'http://127.0.0.1:4173/app/',
    reuseExistingServer: false,
    timeout: 300_000,
  },
})
