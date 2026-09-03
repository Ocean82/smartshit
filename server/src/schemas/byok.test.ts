import { describe, expect, it } from 'vitest'
import { byokBaseUrlSchema, byokSchema, isPublicHttpsByokUrl } from './byok.js'
import { chatBodySchema } from './chat.js'
import { aiFunctionBodySchema } from './aiFunction.js'

describe('isPublicHttpsByokUrl', () => {
  it('accepts public HTTPS endpoints', () => {
    expect(isPublicHttpsByokUrl('https://openrouter.ai/api/v1')).toBe(true)
    expect(isPublicHttpsByokUrl('https://api.groq.com/openai/v1')).toBe(true)
  })

  it('rejects non-HTTPS', () => {
    expect(isPublicHttpsByokUrl('http://openrouter.ai/api/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('ftp://example.com')).toBe(false)
  })

  it('rejects localhost and loopback', () => {
    expect(isPublicHttpsByokUrl('https://localhost/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://127.0.0.1/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://[::1]/v1')).toBe(false)
  })

  it('rejects private and link-local ranges', () => {
    expect(isPublicHttpsByokUrl('https://10.0.0.5/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://172.16.1.1/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://192.168.1.10/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://169.254.169.254/latest')).toBe(false)
  })

  it('rejects .internal / .local hosts', () => {
    expect(isPublicHttpsByokUrl('https://api.internal/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://llm.local/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://foo.localhost/v1')).toBe(false)
  })

  it('rejects the full loopback range, not just 127.0.0.1', () => {
    expect(isPublicHttpsByokUrl('https://127.0.0.2/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://127.1.2.3/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://0.0.0.0/v1')).toBe(false)
  })

  it('rejects CGNAT and additional private ranges', () => {
    expect(isPublicHttpsByokUrl('https://100.64.0.1/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://172.31.255.255/v1')).toBe(false)
  })

  it('rejects alternate IPv4 encodings that decode to loopback', () => {
    expect(isPublicHttpsByokUrl('https://2130706433/v1')).toBe(false)   // decimal 127.0.0.1
    expect(isPublicHttpsByokUrl('https://0177.0.0.1/v1')).toBe(false)   // octal
    expect(isPublicHttpsByokUrl('https://0x7f.0.0.1/v1')).toBe(false)   // hex
  })

  it('rejects IPv6 loopback, link-local, ULA, and IPv4-mapped forms', () => {
    expect(isPublicHttpsByokUrl('https://[::1]/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://[fe80::1]/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://[fc00::1]/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://[fd12:3456::1]/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://[::ffff:127.0.0.1]/v1')).toBe(false)
    expect(isPublicHttpsByokUrl('https://[::ffff:169.254.169.254]/v1')).toBe(false)
  })

  it('still accepts a normal public IPv4 literal', () => {
    expect(isPublicHttpsByokUrl('https://8.8.8.8/v1')).toBe(true)
  })
})

describe('byokBaseUrlSchema', () => {
  it('parses public HTTPS URLs', () => {
    expect(byokBaseUrlSchema.parse('https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
  })

  it('rejects private HTTPS URLs', () => {
    expect(() => byokBaseUrlSchema.parse('https://192.168.0.1/v1')).toThrow()
  })
})

describe('shared byokSchema on chat + ai-function', () => {
  const badByok = {
    apiKey: 'sk-test',
    baseUrl: 'https://127.0.0.1/v1',
    provider: 'custom',
  }

  it('rejects SSRF BYOK on chat body', () => {
    const result = chatBodySchema.safeParse({
      message: 'hello',
      byok: badByok,
    })
    expect(result.success).toBe(false)
  })

  it('rejects SSRF BYOK on ai-function body', () => {
    const result = aiFunctionBodySchema.safeParse({
      function: 'AI.CATEGORIZE',
      args: { input: 'coffee' },
      byok: badByok,
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid BYOK on both schemas', () => {
    const good = {
      apiKey: 'sk-test',
      baseUrl: 'https://openrouter.ai/api/v1',
      provider: 'openrouter',
      model: 'qwen/qwen3-32b',
    }
    expect(byokSchema.safeParse(good).success).toBe(true)
    expect(chatBodySchema.safeParse({ message: 'hi', byok: good }).success).toBe(true)
    expect(aiFunctionBodySchema.safeParse({
      function: 'AI.SUMMARIZE',
      args: { input: 'x' },
      byok: good,
    }).success).toBe(true)
  })
})
