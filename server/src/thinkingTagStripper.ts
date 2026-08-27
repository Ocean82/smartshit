/**
 * Strip thinking tags from LLM output.
 *
 * Reasoning models (Qwen3, DeepSeek-R1, etc.) emit thinking blocks
 * outside of JSON. This module removes them at two levels:
 *
 * 1. Final text: stripThinkingTags(text) for non-streaming responses.
 * 2. Streaming: createThinkingTagFilter(onChunk) wraps a callback to
 *    suppress tokens inside a thinking block and forward only clean content.
 */

const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'
const THINK_CLOSE_LEN = THINK_CLOSE.length // 8

// Matches complete thinking blocks (non-greedy).
const COMPLETE_TAG_RE = /<think>[\s\S]*?<\/think>/gi
// Also handle malformed unclosed tags that trail the end of a string.
const TRAILING_OPEN_RE = /<think>[\s\S]*$/i

/**
 * Remove all thinking blocks from a complete response string.
 * Safe to call on text that contains no thinking tags (no-op).
 */
export function stripThinkingTags(text: string): string {
  return text.replace(COMPLETE_TAG_RE, '').replace(TRAILING_OPEN_RE, '').trim()
}

/**
 * Create a streaming filter that suppresses thinking tokens.
 *
 * Usage:
 *   const clean = createThinkingTagFilter((chunk) => res.write(chunk))
 *   providerStream(messages, clean, signal)
 */
export function createThinkingTagFilter(
  onChunk: (chunk: string) => void,
): (chunk: string) => void {
  let buffer = ''
  let insideThinking = false

  return (chunk: string) => {
    buffer += chunk

    // Process complete lines/tokens from the buffer
    while (buffer.length > 0) {
      if (insideThinking) {
        // Look for closing tag
        const closeIdx = buffer.indexOf(THINK_CLOSE)
        if (closeIdx >= 0) {
          // Discard everything up to and including the closing tag
          buffer = buffer.slice(closeIdx + THINK_CLOSE_LEN)
          insideThinking = false
          // Continue loop to process remaining buffer
        } else {
          // Still inside thinking — hold back last N chars that could be a
          // partial closing tag (e.g. "/thi" at buffer end).
          if (buffer.length > THINK_CLOSE_LEN) {
            const safeEnd = buffer.length - THINK_CLOSE_LEN
            buffer = buffer.slice(safeEnd)
          }
          // Wait for more data
          return
        }
      } else {
        // Look for opening tag
        const openIdx = buffer.indexOf(THINK_OPEN)
        if (openIdx >= 0) {
          // Flush everything before the opening tag
          if (openIdx > 0) {
            onChunk(buffer.slice(0, openIdx))
          }
          buffer = buffer.slice(openIdx + THINK_OPEN.length)
          insideThinking = true
          // Continue loop to find closing tag in remaining buffer
        } else {
          // No opening tag found. Check for a partial opening tag at the tail.
          const partialMatch = buffer.match(/<[^>]*$/)
          if (partialMatch) {
            // Flush everything before the potential partial tag
            if (partialMatch.index! > 0) {
              onChunk(buffer.slice(0, partialMatch.index))
            }
            buffer = buffer.slice(partialMatch.index)
          } else {
            // No partial tag — flush entire buffer
            onChunk(buffer)
            buffer = ''
          }
          return
        }
      }
    }
  }
}
