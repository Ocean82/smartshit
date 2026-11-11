/**
 * Strip comments and string literals from TS/TSX source so static checks only see
 * code tokens. Tokenizer-level (not a parser): it does not understand regex
 * literals, and single/double-quoted strings end at a newline so an apostrophe in
 * JSX text cannot swallow the rest of the file. Failure mode is an over-flag.
 */
export function stripCommentsAndStrings(src: string): string {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && d === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n'
        i++
      }
      i += 2
      continue
    }
    if (c === '"' || c === "'") {
      i++
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') i++
        i++
      }
      if (src[i] === c) i++
      out += '""'
      continue
    }
    if (c === '`') {
      i++
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') i++
        if (src[i] === '\n') out += '\n'
        i++
      }
      i++
      out += '``'
      continue
    }
    out += c
    i++
  }
  return out
}