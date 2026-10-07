import { describe, expect, it } from 'vitest'
import { renameSheetInFormula, validateSheetName } from './sheetRename'

describe('renameSheetInFormula', () => {
  it('rewrites bare and quoted references, case-insensitively', () => {
    expect(renameSheetInFormula('=Sheet1!A1+sheet1!B2', 'Sheet1', 'Data')).toBe('=Data!A1+Data!B2')
    expect(renameSheetInFormula("=SUM('Sheet 1'!A1:A5)", 'Sheet 1', 'Q1 Sales')).toBe("=SUM('Q1 Sales'!A1:A5)")
    expect(renameSheetInFormula('=Sheet1!A1', 'Sheet1', "Bob's")).toBe("='Bob''s'!A1")
    expect(renameSheetInFormula("='Bob''s'!A1", "Bob's", 'Plain')).toBe('=Plain!A1')
  })

  it('leaves other sheets, longer names, and string literals alone', () => {
    expect(renameSheetInFormula('=Sheet10!A1+MySheet1!A1', 'Sheet1', 'X')).toBe('=Sheet10!A1+MySheet1!A1')
    expect(renameSheetInFormula('="Sheet1!A1"&Sheet1!A1', 'Sheet1', 'X')).toBe('="Sheet1!A1"&X!A1')
    expect(renameSheetInFormula('=A1+B1', 'Sheet1', 'X')).toBe('=A1+B1')
  })
})

describe('validateSheetName', () => {
  const sheets = [{ id: 'a', name: 'Sales' }, { id: 'b', name: 'Costs' }]

  it('rejects empty, too long, bad characters, edge apostrophes, and duplicates', () => {
    expect(validateSheetName('', sheets)).toMatch(/empty/)
    expect(validateSheetName('x'.repeat(32), sheets)).toMatch(/31/)
    expect(validateSheetName('Q1/Q2', sheets)).toMatch(/cannot contain/)
    expect(validateSheetName("'Quoted", sheets)).toMatch(/apostrophe/)
    expect(validateSheetName('sales', sheets, 'b')).toMatch(/already exists/)
  })

  it('allows renaming a sheet to a different case of its own name', () => {
    expect(validateSheetName('SALES', sheets, 'a')).toBeNull()
    expect(validateSheetName("Bob's Q1", sheets)).toBeNull()
  })
})
