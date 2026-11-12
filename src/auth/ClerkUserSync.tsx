import { useAuth } from '@clerk/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cancelPendingSaves, getUserId, setAuthTokenProvider, setUserId } from '@/lib/cloudSync'
import { getAuthStatus, setAuthStatus } from '@/lib/serverAccess'
import { LAST_CLOUD_USER_KEY, SIGNOUT_TOAST_FLAG } from '@/lib/authKeys'
import { useStore } from '@/store/useStore'
import { applyAuthTransition } from './applyAuthTransition'
import { SIGNED_OUT_TOAST } from './anonCopy'
import { useSubscriptionStatus } from './useSubscriptionStatus'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key) || null
  } catch {
    return null
  }
}

/**
 * Syncs Clerk session into cloudSync token provider, local user id and the
 * shared auth status (serverAccess). Runs signed-out too: that is how the app
 * learns it is anonymous.
 */
export function ClerkUserSync() {
  if (!CLERK_PUBLISHABLE_KEY) return null
  return <ClerkUserSyncInner />
}

function ClerkUserSyncInner() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  const lastUserRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    const store = useStore.getState()
    const previousStatus = getAuthStatus()
    // Read before setUserId overwrites it: browsers that predate LAST_CLOUD_USER_KEY still
    // remember who was signed in, so an account switch is detected for them too.
    const priorStoredUser = getUserId()
    applyAuthTransition(
      {
        setAuthTokenProvider,
        setUserId,
        cancelPendingSaves,
        clearCloudBindings: () => store.clearCloudBindings(),
        clearCache: () => store.engine.aiRegistry.clearCache(),
        setAuthStatus,
        toast: (t) => store.showToast(t),
        getLastCloudUser: () => readLocal(LAST_CLOUD_USER_KEY) ?? priorStoredUser,
        setLastCloudUser: (id) => {
          try {
            localStorage.setItem(LAST_CLOUD_USER_KEY, id)
          } catch {
            // storage unavailable
          }
        },
        getSignoutToastShown: () => {
          try {
            return sessionStorage.getItem(SIGNOUT_TOAST_FLAG) === '1'
          } catch {
            return true
          }
        },
        setSignoutToastShown: () => {
          try {
            sessionStorage.setItem(SIGNOUT_TOAST_FLAG, '1')
          } catch {
            // storage unavailable
          }
        },
        clearDeviceData: () => {
          void useStore.getState().clearLocalWorkbooks()
        },
        confirm: (m) => window.confirm(m),
        getAuthStatus,
        dismissSignedOutToast: () => {
          const s = useStore.getState()
          for (const t of s.toasts) if (t.message === SIGNED_OUT_TOAST) s.dismissToast(t.id)
        },
      },
      {
        isSignedIn: Boolean(isSignedIn),
        userId: userId ?? null,
        getToken,
        previousStatus,
        previousUserId: lastUserRef.current,
      },
    )
    lastUserRef.current = isSignedIn && userId ? userId : null
  }, [isLoaded, isSignedIn, userId, getToken])

  // Authoritative plan check at sign-on.
  useSubscriptionStatus()
  return null as ReactNode
}
