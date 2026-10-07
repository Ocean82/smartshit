import { configDefaults, defineConfig } from 'vitest/config'

// Vitest 4+ no longer excludes dist/ by default; compiled tests there are stale copies.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'dist/**'] },
})
