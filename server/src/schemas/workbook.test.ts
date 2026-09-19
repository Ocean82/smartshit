/**
 * Workbook body Zod schema tests.
 */

import { describe, it, expect } from 'vitest'
import {
  createWorkbookBodySchema,
  saveWorkbookBodySchema,
  workbookDataJsonSchema,
} from './workbook.js'

describe('workbookDataJsonSchema', () => {
  it('accepts a JSON object string', () => {
    expect(workbookDataJsonSchema.safeParse('{"sheets":[]}').success).toBe(true)
  })

  it('rejects invalid JSON', () => {
    const r = workbookDataJsonSchema.safeParse('{not-json')
    expect(r.success).toBe(false)
  })

  it('rejects JSON arrays and primitives', () => {
    expect(workbookDataJsonSchema.safeParse('[]').success).toBe(false)
    expect(workbookDataJsonSchema.safeParse('"hi"').success).toBe(false)
    expect(workbookDataJsonSchema.safeParse('null').success).toBe(false)
  })
})

describe('createWorkbookBodySchema', () => {
  it('requires name and data', () => {
    expect(createWorkbookBodySchema.safeParse({ data: '{}' }).success).toBe(false)
    expect(createWorkbookBodySchema.safeParse({ name: 'X' }).success).toBe(false)
  })

  it('rejects oversized names', () => {
    const r = createWorkbookBodySchema.safeParse({
      name: 'x'.repeat(201),
      data: '{}',
    })
    expect(r.success).toBe(false)
  })

  it('accepts a valid payload', () => {
    const r = createWorkbookBodySchema.safeParse({
      name: ' Budget ',
      data: '{"id":"1"}',
      sheetCount: 2,
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBe('Budget')
  })
})

describe('saveWorkbookBodySchema', () => {
  it('requires data but name is optional', () => {
    expect(saveWorkbookBodySchema.safeParse({}).success).toBe(false)
    expect(saveWorkbookBodySchema.safeParse({ data: '{}' }).success).toBe(true)
  })
})
