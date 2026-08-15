export interface ScrollBox {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

const NEAR_BOTTOM_PX = 80

export function isScrolledNearBottom(el: ScrollBox, thresholdPx = NEAR_BOTTOM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx
}

/**
 * Auto-scroll only when the user just sent a message or is already following
 * the latest output. Avoids layout-forcing scroll while they read history.
 */
export function shouldStickChatToBottom(
  el: ScrollBox,
  lastMessageRole: 'user' | 'assistant' | 'system' | undefined,
): boolean {
  if (lastMessageRole === 'user') return true
  return isScrolledNearBottom(el)
}
