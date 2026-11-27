import { describe, it, expect } from 'vitest'
import { pendingMigrations } from './migrationsHealth.js'

describe('pendingMigrations', () => {
  it('lists shipped .sql files the database has not recorded, sorted', () => {
    expect(
      pendingMigrations(
        ['008_b.sql', '001_a.sql', '007_c.sql', 'README.md'],
        ['001_a.sql', '007_c.sql'],
      ),
    ).toEqual(['008_b.sql'])
  })

  it('is empty when all are applied, and ignores applied files the build lacks (rollback)', () => {
    expect(pendingMigrations(['001_a.sql'], ['001_a.sql', '009_newer.sql'])).toEqual([])
  })
})
