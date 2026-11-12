import { ClerkProvider, UserButton } from '@clerk/react'
import type { ReactNode } from 'react'
import { useAuthStatus } from '@/lib/serverAccess'
import { LAST_CLOUD_USER_KEY } from '@/lib/authKeys'
import { SIGN_IN_BUTTON } from './anonCopy'
import { APP_PATH } from './authAppearance'
import { openSignIn } from './SignInDialog'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!CLERK_PUBLISHABLE_KEY) {
    // Dev mode — no auth, everything works without Clerk
    return <>{children}</>
  }

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      // Sign-out lands in working anonymous mode, not the marketing page.
      afterSignOutUrl={APP_PATH}
      signInFallbackRedirectUrl={APP_PATH}
      signUpFallbackRedirectUrl={APP_PATH}
    >
      {children}
    </ClerkProvider>
  )
}

function hasReturningUser(): boolean {
  try {
    return Boolean(localStorage.getItem(LAST_CLOUD_USER_KEY))
  } catch {
    return false
  }
}

/**
 * Header account control. Keys off the shared auth status (never Clerk's own
 * components) so it renders before Clerk loads and while Clerk is blocked.
 */
export function UserNav() {
  const status = useAuthStatus()
  if (!CLERK_PUBLISHABLE_KEY || status === 'dev') return null
  if (status === 'signed-in') {
    return (
      <UserButton
        appearance={{
          elements: {
            avatarBox: 'w-8 h-8',
          },
        }}
      />
    )
  }
  // A returning signed-in user sees a neutral placeholder during the Clerk load
  // instead of a "Sign in" flash.
  if (status === 'pending' && hasReturningUser()) {
    return <div className="h-8 w-8 rounded-full bg-slate-200" aria-hidden="true" />
  }
  return (
    <button
      type="button"
      onClick={() => void openSignIn('header')}
      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      {SIGN_IN_BUTTON}
    </button>
  )
}
