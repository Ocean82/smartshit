/**
 * Sandbox Script Validation — Unit Tests
 */

import { describe, it, expect } from 'vitest'
import { validateScript } from '../validate'

describe('Script Validation', () => {
  it('accepts valid simple scripts', () => {
    expect(validateScript('setCell("A1", 42)').valid).toBe(true)
    expect(validateScript('const x = getCell("B2"); log(String(x))').valid).toBe(true)
    expect(validateScript('for (let i = 0; i < 10; i++) { setCell(cellRef(i, 0), i) }').valid).toBe(true)
  })

  it('rejects empty scripts', () => {
    expect(validateScript('').valid).toBe(false)
    expect(validateScript('   ').valid).toBe(false)
  })

  it('rejects scripts with eval()', () => {
    const result = validateScript('eval("alert(1)")')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('eval')
  })

  it('rejects scripts with new Function()', () => {
    const result = validateScript('const fn = new Function("return 1")')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Function')
  })

  it('rejects scripts accessing window', () => {
    const result = validateScript('window.location.href')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('window')
  })

  it('rejects scripts accessing document', () => {
    const result = validateScript('document.cookie')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('document')
  })

  it('rejects scripts with fetch', () => {
    const result = validateScript('fetch("https://evil.com")')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Network')
  })

  it('rejects scripts with setTimeout', () => {
    const result = validateScript('setTimeout(() => {}, 1000)')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('setTimeout')
  })

  it('rejects scripts with dynamic import', () => {
    const result = validateScript('import("fs")')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('import')
  })

  it('rejects scripts with require', () => {
    const result = validateScript('const fs = require("fs")')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('require')
  })

  it('rejects scripts with __proto__', () => {
    const result = validateScript('const x = {}; x.__proto__ = null')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('__proto__')
  })

  it('rejects overly long scripts', () => {
    const longScript = 'x'.repeat(11000)
    const result = validateScript(longScript)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('too long')
  })

  it('allows legitimate uses of similar words in variable names', () => {
    // \bprocess\b does NOT match "processData" because "D" is a word character
    // so the word boundary after "process" doesn't fire
    expect(validateScript('const processData = true; log(String(processData))').valid).toBe(true)
    // But standalone "process" IS caught
    expect(validateScript('const x = process.env').valid).toBe(false)
  })
})
