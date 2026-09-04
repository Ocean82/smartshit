import path from 'node:path'
import { fileURLToPath } from 'node:url'
import wasm from 'vite-plugin-wasm'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Integration test tier — runs against the REAL WASM formula engine.
 *
 * Unlike the default `vitest run` (see vite.config.ts), this config:
 *  - loads `vite-plugin-wasm` so `@ocean8219/formualizer` can import its
 *    `--target bundler` .wasm in a test context, and
 *  - does NOT alias formualizer to the stub.
 *
 * Only `*.realengine.test.ts` files run here. The existing `*.integration.test.ts`
 * suites were written for the stubbed unit environment and are intentionally
 * excluded, so the fast stubbed tier is unaffected. Run with:
 *   npx vitest run --config vitest.integration.config.ts
 */
export default defineConfig({
  plugins: [wasm()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    // The WASM engine is environment-agnostic; node keeps startup light.
    environment: 'node',
    include: ['src/**/*.realengine.test.ts'],
    // vite-plugin-wasm relies on top-level await in the transformed module.
    testTimeout: 20_000,
  },
})
