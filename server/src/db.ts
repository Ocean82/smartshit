import pg from 'pg'
import { config } from './config.js'

const { Pool } = pg

/**
 * PostgreSQL connection pool for the smartsht schema.
 * Only initializes if DATABASE_URL is configured — gracefully no-ops otherwise.
 */
let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (!pool) {
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is not configured. Cloud features are unavailable.')
    }

    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })

    pool.on('error', (err) => {
      console.error('[db] Unexpected pool error:', err.message)
    })
  }

  return pool
}

/**
 * Check if the database is configured and reachable.
 */
export async function dbHealthCheck(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  if (!config.databaseUrl) {
    return { ok: false, error: 'DATABASE_URL not configured' }
  }

  try {
    const start = Date.now()
    const client = await getPool().connect()
    await client.query('SELECT 1')
    client.release()
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: message }
  }
}

/**
 * Convenience query helper with proper error context.
 */
export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const pool = getPool()
  return pool.query<T>(text, params)
}

/**
 * Gracefully close the pool (for clean shutdown).
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
