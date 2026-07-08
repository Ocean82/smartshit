import { ClerkProvider, Show, SignInButton, UserButton, useAuth } from '@clerk/react'
import type { ReactNode } from 'react'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!CLERK_PUBLISHABLE_KEY) {
    // Dev mode — no auth, everything works without Clerk
    return <>{children}</>
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  if (!CLERK_PUBLISHABLE_KEY) {
    return <>{children}</>
  }

  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <SignInPrompt />
      </Show>
    </>
  )
}

export function UserNav() {
  if (!CLERK_PUBLISHABLE_KEY) return null

  return (
    <Show when="signed-in">
      <UserButton
        appearance={{
          elements: {
            avatarBox: 'w-8 h-8',
          },
        }}
      />
    </Show>
  )
}

function SignInPrompt() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 to-blue-900">
      <div className="max-w-md w-full mx-4 text-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-3xl mb-2">📊</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">smartsht</h1>
          <p className="text-gray-600 mb-6">
            Talk to your spreadsheet. No formulas required.
          </p>
          <SignInButton mode="modal">
            <button className="w-full py-3 px-6 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25">
              Sign in to get started
            </button>
          </SignInButton>
          <p className="mt-4 text-xs text-gray-500">
            Free tier includes 3 AI questions per day
          </p>
        </div>
      </div>
    </div>
  )
}

/** Hook to check auth state without Clerk dependency in components */
export function useIsSignedIn(): boolean {
  if (!CLERK_PUBLISHABLE_KEY) return true
  try {
    const { isSignedIn } = useAuth()
    return isSignedIn ?? false
  } catch {
    return false
  }
}
