#!/usr/bin/env node
/**
 * Production-mode Vite build with auth/telemetry stripped for Playwright.
 * `.env.production` ships a placeholder `VITE_CLERK_PUBLISHABLE_KEY` which is
 * truthy, so AuthGate hangs on "Loading…". Process env wins over that file.
 */
import { spawnSync } from 'node:child_process'

const env = {
  ...process.env,
  VITE_CLERK_PUBLISHABLE_KEY: '',
  VITE_SENTRY_DSN: '',
}

const result = spawnSync('npx', ['vite', 'build'], {
  stdio: 'inherit',
  env,
  shell: true,
})

process.exit(result.status === null ? 1 : result.status)
