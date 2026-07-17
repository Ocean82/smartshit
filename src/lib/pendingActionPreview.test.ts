import { describe, expect, it } from 'vitest'
import { findActivePendingPreview } from './pendingActionPreview'
import type { ChatMessage } from '@/types'

describe('findActivePendingPreview', () => {
  it('returns null when no pending previews exist', () => {
    expect(findActivePendingPreview([])).toBeNull()
    expect(findActivePendingPreview([
      {
        id: '1',
        role: 'assistant',
        content: 'hi',
        timestamp: 1,
        actions: [{
          id: 'a1',
          tool: 'clear_sheet',
          params: {},
          description: 'Clear',
          status: 'pending',
        }],
      },
    ])).toBeNull()
  })

  it('finds the newest pending action with preview.changes', () => {
    const messages: ChatMessage[] = [
      {
        id: '1',
        role: 'assistant',
        content: 'old',
        timestamp: 1,
        actions: [{
          id: 'old',
          tool: 'set_cell',
          params: {},
          description: 'Old',
          status: 'pending',
          preview: { changes: [{ cell: 'A1', oldValue: 1, newValue: 2 }] },
        }],
      },
      {
        id: '2',
        role: 'assistant',
        content: 'new',
        timestamp: 2,
        actions: [{
          id: 'new',
          tool: 'clean_sheet_data',
          params: {},
          description: 'Clean',
          status: 'pending',
          preview: {
            changes: [
              { cell: 'b2', oldValue: ' x ', newValue: 'x' },
              { cell: 'C3', oldValue: null, newValue: 'y' },
            ],
          },
        }],
      },
    ]

    const found = findActivePendingPreview(messages)
    expect(found?.action.id).toBe('new')
    expect(found?.changes).toHaveLength(2)
    expect(found?.changeByCell.get('B2')?.newValue).toBe('x')
    expect(found?.changeByCell.get('C3')?.newValue).toBe('y')
  })

  it('skips applied actions and prefers pending with preview', () => {
    const messages: ChatMessage[] = [{
      id: '1',
      role: 'assistant',
      content: 'mix',
      timestamp: 1,
      actions: [
        {
          id: 'applied',
          tool: 'set_cell',
          params: {},
          description: 'Done',
          status: 'applied',
          preview: { changes: [{ cell: 'A1', oldValue: 1, newValue: 2 }] },
        },
        {
          id: 'pending',
          tool: 'modify_column',
          params: {},
          description: 'Modify',
          status: 'pending',
          preview: { changes: [{ cell: 'D4', oldValue: 10, newValue: 11 }] },
        },
      ],
    }]
    expect(findActivePendingPreview(messages)?.action.id).toBe('pending')
  })
})
