/**
 * A UTF-8 file that was saved through a Windows-1252 round trip shows an em
 * dash as three junk characters ("a-circumflex, euro sign, right quote"). One
 * shipped inside a user-facing toast. This fails the build if it happens again.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '..')
const TEXT_FILE = /\.(ts|tsx|js|mjs|css|html|md|txt|json|yml|yaml|sh|conf)$/
// A capital A-tilde / a-circumflex+euro / I-diaeresis+f-hook followed by another non-ASCII character is how
// UTF-8 text looks after a Windows-1252 round trip. A lone capital A-tilde before an ASCII letter is real text.
const MOJIBAKE = new RegExp(
  `${String.fromCharCode(0xc3)}[^\\x00-\\x7f]|${String.fromCharCode(0xe2, 0x20ac)}|${String.fromCharCode(0xcf, 0x192)}`,
)
const DIRS = ['src', 'server/src', 'landing', 'scripts', 'e2e', 'public', '.github/workflows']
describe('source encoding', () => {
  it('has no double-encoded UTF-8 in tracked text files', () => {
    const files = execFileSync('git', ['ls-files', '-z', '--', ...DIRS], { cwd: ROOT, encoding: 'utf8' })
      .split('\0')
      .filter((f) => f && TEXT_FILE.test(f) && !f.includes('package-lock'))
    const offenders = files.filter((f) => {
      const full = path.join(ROOT, f)
      return fs.existsSync(full) && MOJIBAKE.test(fs.readFileSync(full, 'utf8'))
    })
    expect(offenders).toEqual([])
  })
})