import { ClerkProvider, Show, SignIn, UserButton, useAuth } from '@clerk/react'
import type { ReactNode } from 'react'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

/** SPA lives at /app; landing at / has no ClerkProvider. */
const APP_PATH = '/app'

const clerkAppearance = {
  variables: {
    colorPrimary: '#2563eb',
    borderRadius: '0.75rem',
  },
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!CLERK_PUBLISHABLE_KEY) {
    // Dev mode — no auth, everything works without Clerk
    return <>{children}</>
  }

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      signInFallbackRedirectUrl={APP_PATH}
      signUpFallbackRedirectUrl={APP_PATH}
    >
      {children}
    </ClerkProvider>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  if (!CLERK_PUBLISHABLE_KEY) {
    return <>{children}</>
  }

  return <AuthGateInner>{children}</AuthGateInner>
}

function AuthGateInner({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth()

  if (!isLoaded) return <AuthLoading />

  // Pending sessions (email OTP, MFA) are treated as signed-out so <SignIn>
  // stays mounted and can finish verification. Do not use a dismissible modal.
  return (
    <Show when="signed-in" fallback={<SignInPrompt />}>
      {children}
    </Show>
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

function AuthLoading() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 to-blue-900"
      role="status"
      aria-live="polite"
      aria-label="Loading sign in"
    >
      <p className="text-sm font-medium text-white/80">Loading…</p>
    </div>
  )
}

function SignInPrompt() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-blue-900 px-4">
      <h1 className="mb-2 text-2xl font-bold text-white">smartsh!t</h1>
      <p className="mb-6 text-sm text-white/70">
        Talk to your spreadsheet. No formulas required.
      </p>
      <SignIn
        routing="hash"
        fallbackRedirectUrl={APP_PATH}
        signUpFallbackRedirectUrl={APP_PATH}
        appearance={clerkAppearance}
      />
      <p className="mt-4 text-xs text-white/60">
        Free tier includes 3 AI questions per day
      </p>
    </div>
  )
}
