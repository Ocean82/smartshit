#!/usr/bin/env node
/**
 * Production-mode Vite build with telemetry stripped for Playwright.
 * `.env.production` ships a placeholder `VITE_CLERK_PUBLISHABLE_KEY` which is
 * truthy, so the default build blanks it (dev mode: no Clerk). Process env wins
 * over that file.
 *
 * `--anon` builds the anonymous-with-Clerk path into `dist-anon`: a valid-shaped
 * key whose Frontend API host (clerk.invalid) never resolves, so the spec can
 * prove the app works while Clerk is unreachable.
 */
import { spawnSync } from 'node:child_process'
const anon = process.argv.includes('--anon')
const env = {
  ...process.env,
  VITE_CLERK_PUBLISHABLE_KEY: anon ? 'pk_test_Y2xlcmsuaW52YWxpZCQ' : '',
  VITE_SENTRY_DSN: '',
}
const args = ['vite', 'build', ...(anon ? ['--outDir', 'dist-anon', '--emptyOutDir'] : [])]
const result = spawnSync('npx', args, {
  stdio: 'inherit',
  env,
  shell: true,
})
process.exit(result.status === null ? 1 : result.status)
