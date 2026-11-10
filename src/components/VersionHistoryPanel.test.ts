import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const state = { hasPlanPro: false as boolean | null }
const listVersions = vi.fn()

vi.mock('@/auth', () => ({ useUsage: () => ({ hasPlanPro: state.hasPlanPro }) }))
vi.mock('@/components/UpgradeGate', () => ({ UpgradeGate: () => createElement('div', null, 'UPGRADE_GATE') }))
vi.mock('@/components/ReadOnlyGrid', () => ({ ReadOnlyGrid: () => null }))
vi.mock('@/hooks/useFocusTrap', () => ({ useFocusTrap: () => ({ current: null }) }))
vi.mock('@/hooks/useEscapeToClose', () => ({ useEscapeToClose: () => undefined }))
vi.mock('@/store/useStore', () => {
  const s = {
    showVersionHistory: true,
    setShowVersionHistory: () => undefined,
    loadWorkbookData: () => undefined,
    showConfirm: () => undefined,
    showToast: () => undefined,
    files: [{ id: 'f1', cloudWorkbookId: 'wb1' }],
    activeFileId: 'f1',
  }
  return { useStore: (sel: (x: typeof s) => unknown) => sel(s) }
})
vi.mock('@/lib/cloudSync', () => ({
  listVersions: (...a: unknown[]) => listVersions(...a),
  loadVersion: vi.fn(),
  isCloudConfigured: () => true,
  VersionsProRequiredError: class VersionsProRequiredError extends Error {},
}))

import { VersionHistoryPanel, shouldFetchVersions } from './VersionHistoryPanel'

describe('VersionHistoryPanel entitlement (H4)', () => {
  beforeEach(() => {
    listVersions.mockReset()
  })

  it('BYOK-only / free user (hasPlanPro=false) sees the upgrade gate without any request', () => {
    state.hasPlanPro = false
    const html = renderToStaticMarkup(createElement(VersionHistoryPanel))
    expect(html).toContain('UPGRADE_GATE')
    expect(listVersions).not.toHaveBeenCalled()
  })

  it('plan-Pro user does not see the gate', () => {
    state.hasPlanPro = true
    const html = renderToStaticMarkup(createElement(VersionHistoryPanel))
    expect(html).not.toContain('UPGRADE_GATE')
  })

  it('fetches only for a confirmed paid plan that the server has not rejected', () => {
    expect(shouldFetchVersions(true, true, false)).toBe(true)
    expect(shouldFetchVersions(true, false, false)).toBe(false) // BYOK-only / free
    expect(shouldFetchVersions(true, null, false)).toBe(false) // still unknown
    expect(shouldFetchVersions(true, true, true)).toBe(false) // server said 403
    expect(shouldFetchVersions(false, true, false)).toBe(false)
  })
})