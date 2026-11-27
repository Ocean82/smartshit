#!/usr/bin/env node
/**
 * Run SQL migrations against the configured PostgreSQL database.
 * Usage: node scripts/run-migration.mjs [migration-file]
 *
 * If no file is specified, runs all migrations in server/migrations/ in order.
 * Requires DATABASE_URL environment variable.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const migrationsDir = resolve(__dirname, '..', 'migrations')

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable is required.')
  console.error('   Example: DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require')
  process.exit(1)
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

async function run() {
  const targetFile = process.argv[2]

  let files
  if (targetFile) {
    files = [resolve(targetFile)]
  } else {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => join(migrationsDir, f))
  }

  if (files.length === 0) {
    console.log('No migration files found.')
    return
  }

  await client.connect()
  console.log('✅ Connected to database')

  // Create a migrations tracking table if it doesn't exist
  // The schema is normally created by 001; create it here so a fresh database
  // does not fail before 001 can run. Only when missing: CREATE SCHEMA IF NOT
  // EXISTS still needs database CREATE privilege, which the production role lacks.
  const schema = await client.query("SELECT 1 FROM pg_namespace WHERE nspname = 'smartsht'")
  if (schema.rows.length === 0) await client.query('CREATE SCHEMA smartsht')
  await client.query(`
    CREATE TABLE IF NOT EXISTS smartsht.migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  for (const filePath of files) {
    const filename = filePath.split(/[/\\]/).pop()
    
    // Check if already applied
    const existing = await client.query(
      'SELECT 1 FROM smartsht.migrations WHERE filename = $1',
      [filename],
    )

    if (existing.rows.length > 0) {
      console.log(`⏭️  Skipping ${filename} (already applied)`)
      continue
    }

    const sql = readFileSync(filePath, 'utf-8')
    console.log(`▶️  Running ${filename}...`)

    try {
      // One transaction per file so a failure cannot leave a half-applied
      // migration that is not recorded (and would be re-run next time).
      await client.query('BEGIN')
      await client.query(sql)
      await client.query(
        'INSERT INTO smartsht.migrations (filename) VALUES ($1)',
        [filename],
      )
      await client.query('COMMIT')
      console.log(`✅ Applied ${filename}`)
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error(`❌ Failed on ${filename}:`, err.message)
      process.exit(1)
    }
  }

  await client.end()
  console.log('\n🎉 Migrations complete.')
}

run().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
