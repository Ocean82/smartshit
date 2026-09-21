import { describe, expect, it } from 'vitest'

/**
 * Guard: AnchoredPanel must not list `children` in its layout-effect deps.
 * Inline JSX is a new reference every parent render; pairing that with setState
 * in useLayoutEffect causes React error #185 (maximum update depth).
 */
describe('AnchoredPanel update-depth guard', () => {
  it('does not depend on children in the reposition layout effect', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./AnchoredPanel.tsx', import.meta.url), 'utf8'),
    )
    expect(src).not.toMatch(/\}, \[open, reposition, children\]\)/)
    expect(src).toMatch(/\}, \[open, reposition\]\)/)
  })
})
