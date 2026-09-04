import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Candidate `.env` locations, in priority order. The server package root
 * differs between dev and the compiled build:
 *   - dev (tsx runs src/):      __dirname = server/src            → ../.env
 *   - prod (compiled):          __dirname = server/dist/server/src → ../../../.env
 * Both must resolve to `server/.env`. We also honor an explicit override.
 * The first existing file wins; nothing is invented.
 */
function candidateEnvPaths(): string[] {
  const paths: string[] = []
  if (process.env.SMARTSHT_ENV_FILE) paths.push(path.resolve(process.env.SMARTSHT_ENV_FILE))
  paths.push(
    path.resolve(__dirname, '..', '.env'),             // dev: server/src/../.env
    path.resolve(__dirname, '..', '..', '..', '.env'), // prod: server/dist/server/src/../../../.env
    path.resolve(process.cwd(), '.env'),               // last resort: cwd/.env
  )
  return paths
}

/** Where loadEnv() resolved its .env from, for startup/health diagnostics. */
export interface EnvLoadResult {
  /** Absolute path loadEnv() loaded (or the first candidate it tried, if none existed). */
  path: string
  /** True if a .env file existed and was read. */
  loaded: boolean
  /** Number of keys dotenv parsed from it (0 when absent). */
  keyCount: number
  /** All paths considered, for diagnosing a miss. */
  candidates: string[]
}

let lastResult: EnvLoadResult | null = null

export function loadEnv(): EnvLoadResult {
  const candidates = candidateEnvPaths()
  const found = candidates.find((p) => fs.existsSync(p))

  if (!found) {
    lastResult = { path: candidates[0], loaded: false, keyCount: 0, candidates }
    return lastResult
  }

  const result = dotenv.config({ path: found, override: true })
  lastResult = {
    path: found,
    loaded: !result.error,
    keyCount: result.parsed ? Object.keys(result.parsed).length : 0,
    candidates,
  }
  return lastResult
}

/** The result of the most recent loadEnv() call (null if never called). */
export function getEnvLoadResult(): EnvLoadResult | null {
  return lastResult
}
