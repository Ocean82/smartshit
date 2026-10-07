import { describe, expect, it } from 'vitest'
import { buildBankSummarySheet, describeBankImport, parseBankCSV } from './bankImport'

const SAMPLES: Record<string, string> = {
  Chase: [
    'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
    '09/01/2026,09/02/2026,STARBUCKS #123,Food & Drink,Sale,-5.75,',
    '09/03/2026,09/03/2026,PAYROLL ACME,,Payment,2500.00,',
  ].join('\n'),
  'Capital One': [
    'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
    '2026-09-01,2026-09-02,1234,SHELL OIL,Gas,40.00,',
    '2026-09-05,2026-09-05,1234,PAYMENT THANK YOU,Payment,,200.00',
  ].join('\n'),
  'Bank of America': [
    'Date,Description,Amount,Running Bal.',
    '09/01/2026,NETFLIX.COM,-15.49,984.51',
    '09/02/2026,DIRECT DEP EMPLOYER,1200.00,2184.51',
  ].join('\n'),
  'Wells Fargo': [
    'Date,Amount,Description',
    '09/01/2026,-60.00,SAFEWAY STORE',
    '09/02/2026,900.00,DEPOSIT',
  ].join('\n'),
  Citi: [
    'Status,Date,Description,Debit,Credit',
    'Cleared,09/01/2026,AMAZON MKTPLACE,25.00,',
    'Cleared,09/04/2026,REFUND,,10.00',
  ].join('\n'),
  'Generic Bank': [
    'Posting Date,Memo,Amount',
    '09/01/2026,UBER TRIP,-12.30',
    '09/02/2026,SALARY,3000',
  ].join('\n'),
}

describe('parseBankCSV', () => {
  for (const [bank, csv] of Object.entries(SAMPLES)) {
    it(`detects ${bank} and reads one expense and one income`, () => {
      const result = parseBankCSV(csv)
      expect(result?.bankName).toBe(bank)
      expect(result?.transactions.map((t) => t.type)).toEqual(['debit', 'credit'])
      expect(result?.totalExpenses).toBeGreaterThan(0)
      expect(result?.totalIncome).toBeGreaterThan(0)
    })
  }

  it('does not treat look-alike spreadsheets as bank statements', () => {
    expect(parseBankCSV('Date,Description,Value\n09/01/2026,Widget,5')).toBeNull()
    expect(parseBankCSV('Item,Amount\nRent,1500')).toBeNull()
    expect(parseBankCSV('Date,Notes,Amount\n09/01/2026,ok,5')).toBeNull()
  })
})

describe('buildBankSummarySheet', () => {
  it('lays out transactions, totals, and categories', () => {
    const result = parseBankCSV(SAMPLES.Chase)!
    const sheet = buildBankSummarySheet(result)
    expect(sheet.name).toBe('Bank Summary')
    expect(sheet.cells.A4.value).toBe('Date')
    expect(sheet.cells.A4.format?.bold).toBe(true)
    expect(sheet.cells.D5.value).toBe(-5.75)
    expect(sheet.cells.E6.value).toBe('Income')
    expect(sheet.cells.A9.value).toBe('Summary')
    expect(sheet.cells.B10.value).toBe(2500)
    expect(sheet.cells.B12.value).toBe(2494.25)
  })

  it('describes the import for chat', () => {
    const text = describeBankImport('stmt.csv', parseBankCSV(SAMPLES.Chase)!)
    expect(text).toContain('Chase')
    expect(text).toContain('Bank Summary')
  })
})
