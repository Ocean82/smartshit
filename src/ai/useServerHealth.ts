import { useEffect, useState } from 'react'
import type { ServerHealth } from '@/ai/agentClient'
import { getServerHealthSnapshot, subscribeServerHealth } from '@/ai/serverHealth'

/** Subscribe to the shared AI server health poller. */
export function useServerHealth(): ServerHealth | null {
  const [health, setHealth] = useState<ServerHealth | null>(getServerHealthSnapshot)

  useEffect(() => subscribeServerHealth(setHealth), [])

  return health
}
