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
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()

  useEffect(() => {
    if (!isLoaded) return
    setAuthTokenProvider(async () => {
      if (!isSignedIn) return null
      return (await getToken()) ?? null
    })
  }, [isLoaded, isSignedIn, getToken])

  useEffect(() => {
    if (!isLoaded) return
    setUserId(isSignedIn && userId ? userId : null)
  }, [isLoaded, isSignedIn, userId])

  return null as ReactNode
}
