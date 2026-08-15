import { describe, expect, it } from 'vitest'
import { shouldStickChatToBottom } from './chatScroll'

function box(scrollHeight: number, scrollTop: number, clientHeight: number) {
  return { scrollHeight, scrollTop, clientHeight }
}

describe('shouldStickChatToBottom', () => {
  it('sticks when the last message is from the user', () => {
    expect(shouldStickChatToBottom(box(1000, 0, 200), 'user')).toBe(true)
  })

  it('sticks when the viewport is near the bottom', () => {
    expect(shouldStickChatToBottom(box(1000, 780, 200), 'assistant')).toBe(true)
  })

  it('does not steal scroll when the user has read earlier messages', () => {
    expect(shouldStickChatToBottom(box(1000, 0, 200), 'assistant')).toBe(false)
  })
})
