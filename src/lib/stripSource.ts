/**
 * Strip comments and string literals from TS/TSX source so static checks only see
 * code tokens. Tokenizer-level (not a parser): it does not understand regex
 * literals, and single/double-quoted strings end at a newline so an apostrophe in
 * JSX text cannot swallow the rest of the file. Failure mode is an over-flag.
 * Template literal text is removed but `${...}` interpolations (including nested
 * templates) are kept as code, so a call inside one is still visible.
 */
export function stripCommentsAndStrings(src: string): string {
  let out = ''
  let i = 0
  const n = src.length
  // One entry per open `${`: the brace depth inside that interpolation, so its
  // closing `}` (and only that one) returns to template-text mode.
  const interp: number[] = []
  // Consume template text up to the closing backtick or the next `${`.
  const readTemplateText = () => {
    while (i < n) {
      if (src[i] === '\\') {
        if (src[i + 1] === '\n') out += '\n'
        i += 2
        continue
      }
      if (src[i] === '`') {
        i++
        out += '`'
        return
      }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2
        out += '${'
        interp.push(0)
        return
      }
      if (src[i] === '\n') out += '\n'
      i++
    }
  }
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
      // Template text is stripped; `${...}` interpolations stay as code.
      i++
      out += '`'
      readTemplateText()
      continue
    }
    if (interp.length > 0) {
      const top = interp.length - 1
      if (c === '{') interp[top]++
      else if (c === '}') {
        if (interp[top] === 0) {
          interp.pop()
          i++
          out += '}'
          readTemplateText()
          continue
        }
        interp[top]--
      }
    }
    out += c
    i++
  }
  return out
}