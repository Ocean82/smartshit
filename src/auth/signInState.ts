import type { AuthStatus } from '@/lib/serverAccess'

export type SignInReason =
  | 'chat'
  | 'ai-function'
  | 'cloud'
  | 'share'
  | 'upgrade'
  | 'version-history'
  | 'header'

const REASONS: readonly SignInReason[] = [
  'chat',
  'ai-function',
  'cloud',
  'share',
  'upgrade',
  'version-history',
  'header',
]

/** Unknown reasons fall back to 'header'. */
export function normalizeReason(reason: unknown): SignInReason {
  return REASONS.includes(reason as SignInReason) ? (reason as SignInReason) : 'header'
}

/**
 * What `openSignIn` should do once status is settled.
 * - signed-in: nothing to open; the upgrade flow continues into checkout.
 * - dev: no auth at all, nothing to do.
 * - anonymous / still pending: open the dialog.
 */
export function decideSignInAction(
  status: AuthStatus,
  reason: SignInReason,
): 'open-dialog' | 'continue' | 'noop' {
  if (status === 'dev') return 'noop'
  if (status === 'signed-in') return reason === 'upgrade' ? 'continue' : 'noop'
  return 'open-dialog'
}

/** The dialog closes itself as soon as the user is signed in. */
export function shouldCloseSignIn(status: AuthStatus, isOpen: boolean): boolean {
  return isOpen && status === 'signed-in'
}
