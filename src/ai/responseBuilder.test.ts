import { expect, it } from 'vitest'
import { toolResultToChatMessage } from './responseBuilder'
import type { SheetData } from '@/types'
import { refToCell } from '@/engine/spreadsheet'

it('normalizes LLM delete actions to an exact guarded row with a preview', () => {
  const sheet: SheetData = {
    id: 'sheet',
    name: 'Expenses',
    cells: {
      A1: { value: 'Item' }, B1: { value: 'Amount' },
      A2: { value: 'Netflix' }, B2: { value: 15 },
    },
    columnWidths: {},
    rowHeights: {},
    charts: [],
  }
  const getComputedValue = (row: number, col: number) => String(sheet.cells[refToCell(row, col)]?.value ?? '')
  const message = toolResultToChatMessage({
    success: true,
    message: 'Remove Netflix',
    actions: [{ tool: 'delete_row', params: { match: 'Netflix' }, description: 'Remove Netflix' }],
  }, { previewContext: { sheet, getComputedValue } })

  expect(message.actions?.[0].params).toMatchObject({ row: 2 })
  expect(message.actions?.[0].params).not.toHaveProperty('match')
  expect(message.actions?.[0].params.expectedRowSignature).toBeTypeOf('string')
  expect(message.actions?.[0].preview?.changes.map((change) => change.cell)).toEqual(['A2', 'B2'])
})
