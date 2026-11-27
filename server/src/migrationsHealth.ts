import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { query } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * server/migrations, from src/ (dev) or dist/server/src/ (prod build), same
 * layout rule as loadEnv.ts. A build only knows its own migration files, so a
 * rollback to an older build is not failed by migrations it never shipped.
 */
function migrationsDir(): string | null {
  const candidates = [
    path.resolve(__dirname, '..', 'migrations'),
    path.resolve(__dirname, '..', '..', '..', 'migrations'),
  ]
  return candidates.find((p) => fs.existsSync(p)) ?? null
}

/** Pure: migration files this build ships that the database has not recorded. */
export function pendingMigrations(files: string[], applied: string[]): string[] {
  const done = new Set(applied)
  return files.filter((f) => f.endsWith('.sql') && !done.has(f)).sort()
}

/**
 * Strict-readiness check: fails when this build ships a migration the DB has
 * not applied. Without it, a deploy that skipped `npm run migrate` passed the
 * health gate while every route reading the new column 500'd (2026-11-27, 008).
 */
export async function migrationsHealthCheck(): Promise<{ ok: boolean; pending?: string[]; error?: string }> {
  const dir = migrationsDir()
  if (!dir) return { ok: false, error: 'migrations directory not found' }
  try {
    const files = fs.readdirSync(dir)
    const result = await query<{ filename: string }>('SELECT filename FROM smartsht.migrations')
    const pending = pendingMigrations(files, result.rows.map((r) => r.filename))
    return pending.length ? { ok: false, pending } : { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
