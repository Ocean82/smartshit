/**
 * REAL WASM formula engine coverage (integration tier).
 *
 * The default unit tier aliases @ocean8219/formualizer to a stub that has no
 * dependency graph, recalc, cross-sheet refs, circular detection, or error
 * propagation (see src/__mocks__/@ocean8219/formualizer.stub.ts). These tests
 * exercise the ACTUAL WASM engine so those semantics — which the auditor, grid,
 * and chat actions all depend on — have real coverage.
 *
 * Expectations here were confirmed against the real engine, not assumed.
 *
 * Run: npx vitest run --config vitest.integration.config.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { Workbook, initializeWasm } from '@ocean8219/formualizer'

beforeAll(async () => {
  await initializeWasm()
})

function newSheet(name = 'Sheet1') {
  const wb = new Workbook()
  wb.addSheet(name)
  return wb
}

describe('real formualizer WASM — evaluation basics', () => {
  it('evaluates literal arithmetic', () => {
    const wb = newSheet()
    wb.setFormula('Sheet1', 1, 1, '=1+2')
    wb.evaluateAll()
    expect(Number(wb.evaluateCell('Sheet1', 1, 1))).toBe(3)
  })

  it('evaluates SUM over a range', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 1, 1, 10)
    wb.setValue('Sheet1', 2, 1, 20)
    wb.setValue('Sheet1', 3, 1, 30)
    wb.setFormula('Sheet1', 4, 1, '=SUM(A1:A3)')
    wb.evaluateAll()
    expect(Number(wb.evaluateCell('Sheet1', 4, 1))).toBe(60)
  })
})

describe('real formualizer WASM — dependency graph & recalc', () => {
  it('recalculates a dependent cell after an upstream edit', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 1, 1, 10)
    wb.setFormula('Sheet1', 2, 1, '=A1*2')
    wb.evaluateAll()
    expect(Number(wb.evaluateCell('Sheet1', 2, 1))).toBe(20)

    // Edit the upstream value — the dependent must reflect it. The stub can't
    // do this (evaluateAll is a no-op, no dependency graph).
    wb.setValue('Sheet1', 1, 1, 100)
    wb.evaluateAll()
    expect(Number(wb.evaluateCell('Sheet1', 2, 1))).toBe(200)
  })

  it('propagates through a multi-hop chain', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 1, 1, 2)
    wb.setFormula('Sheet1', 2, 1, '=A1*3')  // 6
    wb.setFormula('Sheet1', 3, 1, '=A2+4')  // 10
    wb.evaluateAll()
    expect(Number(wb.evaluateCell('Sheet1', 3, 1))).toBe(10)

    wb.setValue('Sheet1', 1, 1, 5)
    wb.evaluateAll()
    expect(Number(wb.evaluateCell('Sheet1', 3, 1))).toBe(19) // 5*3=15, +4=19
  })
})

describe('real formualizer WASM — cross-sheet references', () => {
  it('resolves a reference to another sheet (both quote styles)', () => {
    const wb = new Workbook()
    wb.addSheet('S1')
    wb.addSheet('S2')
    wb.setValue('S1', 1, 1, 42)
    wb.setFormula('S2', 1, 1, '=S1!A1')
    wb.setFormula('S2', 1, 2, "='S1'!A1")
    wb.evaluateAll()
    expect(Number(wb.evaluateCell('S2', 1, 1))).toBe(42)
    expect(Number(wb.evaluateCell('S2', 1, 2))).toBe(42)
  })
})

describe('real formualizer WASM — error propagation', () => {
  it('detects circular references (#CIRC!) without throwing', () => {
    const wb = newSheet()
    wb.setFormula('Sheet1', 1, 1, '=B1+1')
    wb.setFormula('Sheet1', 1, 2, '=A1+1')
    expect(() => wb.evaluateAll()).not.toThrow()
    expect(String(wb.evaluateCell('Sheet1', 1, 1))).toBe('#CIRC!')
  })

  it('returns #DIV/0! for division by zero', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 1, 1, 5)
    wb.setValue('Sheet1', 2, 1, 0)
    wb.setFormula('Sheet1', 3, 1, '=A1/A2')
    wb.evaluateAll()
    expect(String(wb.evaluateCell('Sheet1', 3, 1))).toBe('#DIV/0!')
  })

  it('returns #NAME? for an unknown function', () => {
    const wb = newSheet()
    wb.setFormula('Sheet1', 1, 1, '=NOSUCHFN(1)')
    wb.evaluateAll()
    expect(String(wb.evaluateCell('Sheet1', 1, 1))).toBe('#NAME?')
  })
})
