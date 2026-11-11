#!/usr/bin/env node
/**
 * Builds the default (no Clerk) and anonymous (`--anon`, unreachable Clerk) E2E
 * bundles one after the other, then serves them: dist on 4173, dist-anon on 4174.
 * Sequential so two `vite build` runs never race on the same project.
 */
import { spawnSync } from 'node:child_process'
import { preview } from 'vite'

for (const args of [[], ['--anon']]) {
  const r = spawnSync('node', ['scripts/build-e2e.mjs', ...args], { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
for (const [outDir, port] of [['dist', 4173], ['dist-anon', 4174]]) {
  const server = await preview({
    build: { outDir },
    preview: { host: '127.0.0.1', port, strictPort: true },
  })
  server.printUrls()
}
// Keep the process alive; Playwright terminates it.
globalThis.setInterval(() => {}, 1 << 30)
