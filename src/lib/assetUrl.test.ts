import { describe, expect, it } from 'vitest'
import { assetUrl } from './assetUrl'

describe('assetUrl', () => {
  it('prefixes Vite BASE_URL', () => {
    // BASE_URL is /app/ in vite.config; vitest inherits the same config.
    expect(assetUrl('models/minilm/intent-vectors.bin')).toBe(
      `${import.meta.env.BASE_URL}models/minilm/intent-vectors.bin`,
    )
    expect(assetUrl('/logo.png')).toBe(`${import.meta.env.BASE_URL}logo.png`)
  })
})
