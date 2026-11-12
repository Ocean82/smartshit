/**
 * Decide whether cloud bindings from a previous account must be removed.
 *
 * - no remembered user (existing browsers have none): keep, the common case is
 *   the same user. The server still refuses cross-account access.
 * - same user: keep.
 * - different user: unbind (local data is never deleted, only the cloud link).
 */
export function decideCloudUnbind(
  lastUser: string | null | undefined,
  currentUser: string,
): 'keep' | 'unbind' {
  if (!lastUser) return 'keep'
  return lastUser === currentUser ? 'keep' : 'unbind'
}
