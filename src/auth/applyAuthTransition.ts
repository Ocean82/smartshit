import type { AuthStatus } from '@/lib/serverAccess'
import type { Toast } from '@/types'
import { decideCloudUnbind } from './accountSwitch'
import {
  CLEAR_DEVICE_CONFIRM,
  CLEAR_DEVICE_LABEL,
  CLOUD_LINKS_REMOVED_TOAST,
  SIGNED_OUT_TOAST,
} from './anonCopy'

type TokenFn = () => Promise<string | null>

export interface AuthTransitionDeps {
  setAuthTokenProvider: (provider: TokenFn | null) => void
  setUserId: (userId: string | null) => void
  cancelPendingSaves: () => void
  clearCloudBindings: () => void
  clearCache: () => void
  setAuthStatus: (status: AuthStatus) => void
  toast: (toast: Omit<Toast, 'id'>) => void
  getLastCloudUser: () => string | null
  /** The signed-in user id currently stored for cloud sync (smartsht-user-id). */
  getStoredUserId: () => string | null
  setLastCloudUser: (id: string) => void
  getSignoutToastShown: () => boolean
  setSignoutToastShown: () => void
  /** The destructive action; only ever invoked from the toast button after confirm. */
  clearDeviceData: () => void
  confirm: (message: string) => boolean
  /** Current published status; the clear action is inert once a sign-in has begun. */
  getAuthStatus: () => AuthStatus
  /** Remove any outstanding sign-out notice (and its clear button). */
  dismissSignedOutToast: () => void
}

export interface AuthTransitionInput {
  isSignedIn: boolean
  userId: string | null | undefined
  getToken: () => Promise<string | null>
  /** Status published before this run. */
  previousStatus: AuthStatus
  /** User id applied by the previous signed-in run, if any. */
  previousUserId: string | null
}

/**
 * Apply a Clerk-reported auth state. The order is fixed and `setAuthStatus` is
 * strictly last, so no subscriber can observe `signed-in` (or `anonymous`)
 * before the state it depends on exists.
 */
export function applyAuthTransition(deps: AuthTransitionDeps, input: AuthTransitionInput): void {
  const { isSignedIn, userId, getToken, previousStatus, previousUserId } = input

  // Who owned this browser's cloud links, read BEFORE setUserId overwrites the
  // stored id. Browsers that predate LAST_CLOUD_USER_KEY still have the stored id.
  const priorOwner = deps.getLastCloudUser() ?? deps.getStoredUserId()

  if (isSignedIn && userId) {
    deps.setAuthTokenProvider(async () => (await getToken()) ?? null)
    deps.setUserId(userId)
    // Unbind/clearCache only for a real sign-in or user change, not for a
    // getToken-identity re-run (that would discard valid cached AI.* results).
    const isNewSignIn = previousStatus !== 'signed-in' || previousUserId !== userId
    if (isNewSignIn) {
      if (decideCloudUnbind(priorOwner, userId) === 'unbind') {
        deps.clearCloudBindings()
        deps.toast({ type: 'info', message: CLOUD_LINKS_REMOVED_TOAST })
      }
      deps.setLastCloudUser(userId)
      deps.clearCache()
    }
    deps.dismissSignedOutToast()
    deps.setAuthStatus('signed-in')
    return
  }

  deps.setAuthTokenProvider(null)
  deps.setUserId(null)
  deps.cancelPendingSaves()
  const wasSignedIn = previousStatus === 'signed-in'
  // Persisted rule: a browser that has ever had a signed-in user sees the
  // notice once per session on its first anonymous settle (covers reload after
  // sign-out, session expiry and other-tab sign-out). In-page sign-out always.
  const shouldToast =
    Boolean(priorOwner) && (wasSignedIn || !deps.getSignoutToastShown())
  if (shouldToast) {
    deps.setSignoutToastShown()
    deps.toast({
      type: 'info',
      message: SIGNED_OUT_TOAST,
      duration: Infinity,
      action: {
        label: CLEAR_DEVICE_LABEL,
        onClick: () => {
          // Inert once a sign-in has happened (checked again after the confirm,
          // in case confirm is not a blocking dialog).
          if (deps.getAuthStatus() === 'signed-in') return
          if (!deps.confirm(CLEAR_DEVICE_CONFIRM)) return
          if (deps.getAuthStatus() === 'signed-in') return
          deps.clearDeviceData()
        },
      },
    })
  }
  deps.setAuthStatus('anonymous')
}
