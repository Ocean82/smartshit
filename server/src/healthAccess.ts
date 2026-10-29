/**
 * Decide whether `/health?strict=1` may include the `critical` diagnostics
 * object (raw DB/S3/Clerk error strings).
 *
 * Behind nginx every proxied request has `req.socket.remoteAddress` of
 * 127.0.0.1, so loopback alone is not enough — that would leak internals to
 * the public internet. The deploy gate curls `http://127.0.0.1:8787` directly
 * (no `X-Forwarded-For`). Proxied traffic always carries that header.
 */
export function shouldShowHealthDiagnostics(opts: {
  peer: string
  forwardedFor: string | string[] | undefined
  authenticated: boolean
}): boolean {
  if (opts.authenticated) return true

  const peer = opts.peer
  const isLoopback =
    peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1'
  if (!isLoopback) return false

  const forwarded = opts.forwardedFor
  const hasForwarded =
    typeof forwarded === 'string'
      ? forwarded.trim().length > 0
      : Array.isArray(forwarded) && forwarded.some((v) => v.trim().length > 0)

  return !hasForwarded
}
