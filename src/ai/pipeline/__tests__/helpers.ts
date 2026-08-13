/**
 * Shared test utilities for pipeline integration tests.
 *
 * Centralizes helpers and fixture factories so that intent shape changes,
 * context mocks, and pipeline assembly only need updating in one place.
 */

import { vi } from 'vitest'
import type { PipelineContext } from '../types'
import type { parseUserIntent } from '@shared/intentParser'

// ─── Fixture Factories ──────────────────────────────────────────────────────

/**
 * Create a default "unknown" UserIntent for tests where intent classification
 * should not influence routing.
 */
export function defaultIntent(rawQuery = ''): ReturnType<typeof parseUserIntent> {
  return {
    intentType: 'unknown',
    targetColumns: [],
    filters: {},
    parameters: {},
    rawQuery,
    confidence: 0.3,
    routingSource: 'regex',
  }
}

/**
 * Create a minimal PipelineContext for a given user message.
 */
export function makeContext(message: string): PipelineContext {
  return {
    message,
    workbook: { sheets: [{ id: 's1', name: 'Sheet1' }], name: 'TestWorkbook' } as unknown as PipelineContext['workbook'],
    sheet: { cells: {} } as unknown as PipelineContext['sheet'],
    selection: null,
    getComputedValue: () => '',
  }
}

/**
 * Create mock stage dependencies (buildExecContext, pushHistory).
 */
export function makeDeps() {
  return {
    buildExecContext: vi.fn().mockReturnValue({}),
    pushHistory: vi.fn(),
  }
}
