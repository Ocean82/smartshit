/**
 * DNS-resolution guard tests for assertPublicByokHost.
 *
 * node:dns/promises is mocked so the resolved-IP branch is exercised without
 * real network I/O. IP-literal inputs are checked synchronously (no lookup).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const lookupMock = vi.fn()
vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}))

import { assertPublicByokHost } from './byok.js'

beforeEach(() => {
  lookupMock.mockReset()
})

describe('assertPublicByokHost', () => {
  it('rejects a public hostname that resolves to a private IP (DNS rebinding)', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    await expect(assertPublicByokHost('https://evil.example.com/v1')).rejects.toThrow(/non-public/i)
    expect(lookupMock).toHaveBeenCalledWith('evil.example.com', { all: true })
  })

  it('rejects when ANY resolved address is private (mixed A records)', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ])
    await expect(assertPublicByokHost('https://mixed.example.com/v1')).rejects.toThrow(/non-public/i)
  })

  it('rejects a hostname that resolves to a private IPv6 (ULA)', async () => {
    lookupMock.mockResolvedValue([{ address: 'fd00::1', family: 6 }])
    await expect(assertPublicByokHost('https://v6.example.com/v1')).rejects.toThrow(/non-public/i)
  })

  it('accepts a hostname that resolves to public addresses only', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    await expect(assertPublicByokHost('https://api.openai.com/v1')).resolves.toBeUndefined()
  })

  it('rejects when resolution fails', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'))
    await expect(assertPublicByokHost('https://nope.example.com/v1')).rejects.toThrow(/resolve/i)
  })

  it('rejects private IP literals without any DNS lookup', async () => {
    await expect(assertPublicByokHost('https://2130706433/v1')).rejects.toThrow(/non-public/i)
    await expect(assertPublicByokHost('https://[::ffff:127.0.0.1]/v1')).rejects.toThrow(/non-public/i)
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('accepts a public IP literal without DNS lookup', async () => {
    await expect(assertPublicByokHost('https://8.8.8.8/v1')).resolves.toBeUndefined()
    expect(lookupMock).not.toHaveBeenCalled()
  })
})
