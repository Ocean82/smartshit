import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startBackgroundServices } from './startup.js'
import { validateConfig } from './config.js'
import { startReconciler } from './subscriptions.js'

vi.mock('./config.js', () => ({ validateConfig: vi.fn() }))
vi.mock('./subscriptions.js', () => ({ startReconciler: vi.fn() }))

describe('startBackgroundServices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates config before starting the reconciler on boot', () => {
    startBackgroundServices()

    expect(validateConfig).toHaveBeenCalledTimes(1)
    expect(startReconciler).toHaveBeenCalledTimes(1)
    expect(vi.mocked(validateConfig).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(startReconciler).mock.invocationCallOrder[0],
    )
  })
})