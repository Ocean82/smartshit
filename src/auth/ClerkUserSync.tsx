import { useAuth } from '@clerk/react'
import { useEffect, type ReactNode } from 'react'
import { setAuthTokenProvider, setUserId } from '@/lib/cloudSync'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

/** Syncs Clerk session into cloudSync token provider + local user id. */
export function ClerkUserSync() {
  if (!CLERK_PUBLISHABLE_KEY) return null
  return <ClerkUserSyncInner />
}

function ClerkUserSyncInner() {
  const { isSignedIn, userId, getToken } = useAuth()

  useEffect(() => {
    setAuthTokenProvider(async () => {
      if (!isSignedIn) return null
      return (await getToken()) ?? null
    })
  }, [isSignedIn, getToken])

  useEffect(() => {
    setUserId(isSignedIn && userId ? userId : null)
  }, [isSignedIn, userId])

  return null as ReactNode
}
