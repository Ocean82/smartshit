/**
 * Cloud Sync Unit Tests
 *
 * Focus: the per-file binding fix. The debounce timer and save target are
 * keyed/parameterized by cloud workbook id, so a pending save for workbook A
 * can never flush workbook B's contents over A's cloud slot (and vice versa).
 *
 * Requirements tested: 2.2, 2.3, 4.1, 4.2, 5.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  scheduleSave,
  flushSave,
  saveToCloud,
  setUserId,
  setAuthTokenProvider,
} from './cloudSync'
import type { WorkbookData } from '@/types'

function makeWorkbook(name: string): WorkbookData {
  return {
    id: `wb-${name}`,
    name,
    sheets: [],
    activeSheetId: 's1',
    createdAt: 0,
    updatedAt: 0,
  } as unknown as WorkbookData
}

/** Pull the parsed JSON body out of a recorded fetch call. */
function bodyOf(call: unknown[]): { name: string } {
  const init = call[1] as RequestInit
  return JSON.parse(init.body as string) as { name: string }
}

let fetchMock: ReturnType<typeof vi.fn>

function mockLocalStorage(): void {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    get length() { return map.size },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mockLocalStorage()
  // "Cloud configured" = a user id is present (persisted in localStorage).
  setUserId('user-1')
  setAuthTokenProvider(async () => 'test-token')
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ saved: true, version: 1, sizeBytes: 0 }), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setUserId(null)
  setAuthTokenProvider(async () => null)
})

describe('scheduleSave debounce isolation (the data-corruption fix)', () => {
  it('flushes each cloud id with its OWN workbook body — no cross-over', async () => {
    scheduleSave('cloud-A', makeWorkbook('Budget'))
    scheduleSave('cloud-B', makeWorkbook('Groceries'))

    await vi.runAllTimersAsync()

    expect(fetchMock).toHaveBeenCalledTimes(2)

    const byUrl = new Map(
      fetchMock.mock.calls.map((c) => [String(c[0]), bodyOf(c)]),
    )
    // A's slot received Budget; B's slot received Groceries — never swapped.
    expect(byUrl.get('/api/workbooks/cloud-A')?.name).toBe('Budget')
    expect(byUrl.get('/api/workbooks/cloud-B')?.name).toBe('Groceries')
  })

  it('debounces per id: rescheduling the same id coalesces to one save', async () => {
    scheduleSave('cloud-A', makeWorkbook('v1'))
    scheduleSave('cloud-A', makeWorkbook('v2'))

    await vi.runAllTimersAsync()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(fetchMock.mock.calls[0]).name).toBe('v2')
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/workbooks/cloud-A')
  })

  it('a pending save for A fires against A even after scheduling B (no redirect)', async () => {
    scheduleSave('cloud-A', makeWorkbook('Budget'))
    // Switch files: schedule B before A's debounce elapses.
    vi.advanceTimersByTime(2_000)
    scheduleSave('cloud-B', makeWorkbook('Groceries'))

    await vi.runAllTimersAsync()

    const aCall = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/workbooks/cloud-A')
    expect(aCall).toBeDefined()
    expect(bodyOf(aCall!).name).toBe('Budget')
  })
})

describe('scheduleSave / flushSave guards', () => {
  it('no-ops when cloud id is null or undefined', async () => {
    scheduleSave(null, makeWorkbook('x'))
    scheduleSave(undefined, makeWorkbook('x'))
    flushSave(null, makeWorkbook('x'))
    await vi.runAllTimersAsync()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no-ops when cloud is not configured', async () => {
    setUserId(null)
    scheduleSave('cloud-A', makeWorkbook('x'))
    flushSave('cloud-A', makeWorkbook('x'))
    await vi.runAllTimersAsync()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('flushSave', () => {
  it('cancels the pending debounce for that id and saves immediately', async () => {
    scheduleSave('cloud-A', makeWorkbook('debounced'))
    flushSave('cloud-A', makeWorkbook('flushed'))

    // Let the flush's async fetch resolve, then ensure the old timer did not
    // also fire a second save.
    await vi.runAllTimersAsync()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(fetchMock.mock.calls[0]).name).toBe('flushed')
  })
})

describe('saveToCloud targeting', () => {
  it('PUTs the passed workbook to /api/workbooks/{cloudId}', async () => {
    const p = saveToCloud('cloud-Z', makeWorkbook('Report'))
    await vi.runAllTimersAsync()
    await p

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/api/workbooks/cloud-Z')
    expect((init as RequestInit).method).toBe('PUT')
    expect(bodyOf(fetchMock.mock.calls[0]).name).toBe('Report')
  })

  it('returns null without fetching when cloudId is empty', async () => {
    const result = await saveToCloud('', makeWorkbook('x'))
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
