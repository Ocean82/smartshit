import { SignIn } from '@clerk/react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getAuthStatus, useAuthStatus, useClerkLoaded, whenAuthSettled } from '@/lib/serverAccess'
import { SIGN_IN_UNAVAILABLE, SIGN_IN_UPGRADE_HINT } from './anonCopy'
import { decideSignInAction, normalizeReason, shouldCloseSignIn, type SignInReason } from './signInState'
import { APP_PATH, clerkAppearance } from './authAppearance'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''
const UNAVAILABLE_AFTER_MS = 8_000

// ─── Module-level dialog store (same pattern as the usage subscribers) ───────
interface DialogState {
  open: boolean
  reason: SignInReason
}
let dialogState: DialogState = { open: false, reason: 'header' }
const dialogListeners = new Set<() => void>()

function setDialogState(next: DialogState): void {
  dialogState = next
  dialogListeners.forEach((fn) => fn())
}
function subscribeDialog(fn: () => void): () => void {
  dialogListeners.add(fn)
  return () => {
    dialogListeners.delete(fn)
  }
}
const getDialogState = () => dialogState

/**
 * Open the sign-in dialog for an explicit user action. Never call on load or on
 * a timer. While Clerk is still loading it waits (bounded) so a returning
 * signed-in user is not sent to sign-in. Resolves what the caller should do:
 * 'continue' (already signed in, upgrade flow proceeds), 'noop', or
 * 'open-dialog' (the dialog is now open).
 */
export async function openSignIn(reason?: SignInReason): Promise<'open-dialog' | 'continue' | 'noop'> {
  if (!CLERK_PUBLISHABLE_KEY) return 'noop'
  const r = normalizeReason(reason)
  let status = getAuthStatus()
  if (status === 'pending') status = await whenAuthSettled(3000)
  const action = decideSignInAction(status, r)
  if (action === 'open-dialog') setDialogState({ open: true, reason: r })
  return action
}

export function closeSignIn(): void {
  if (dialogState.open) setDialogState({ ...dialogState, open: false })
}

/** Dismissible sign-in dialog. Renders nothing without a Clerk key. */
export function SignInDialog() {
  if (!CLERK_PUBLISHABLE_KEY) return null
  return <SignInDialogInner />
}

function SignInDialogInner() {
  const state = useSyncExternalStore(subscribeDialog, getDialogState, getDialogState)
  const status = useAuthStatus()

  // Close as soon as the user is signed in, so Clerk's <SignIn> never shows its
  // already-signed-in state.
  useEffect(() => {
    if (shouldCloseSignIn(status, state.open)) closeSignIn()
  }, [status, state.open])

  if (!state.open) return null
  return <DialogBody reason={state.reason} />
}

function DialogBody({ reason }: { reason: SignInReason }) {
  const clerkLoaded = useClerkLoaded()
  const status = useAuthStatus()
  const [waited, setWaited] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), UNAVAILABLE_AFTER_MS)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closeSignIn()
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // nonymous without Clerk having reported means the 8 s fallback fired.
  const unavailable = !clerkLoaded && (waited || status === 'anonymous')

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeSignIn()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to smartsh!t"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative flex max-h-[95vh] flex-col items-center overflow-y-auto rounded-2xl bg-gradient-to-br from-slate-900 to-blue-900 p-6 outline-none"
      >
        <button
          type="button"
          onClick={closeSignIn}
          aria-label="Close sign in"
          className="absolute right-3 top-3 rounded-md px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          ✕
        </button>
        <h1 className="mb-2 text-2xl font-bold text-white">smartsh!t</h1>
        <p className="mb-4 text-sm text-white/70">Talk to your spreadsheet. No formulas required.</p>
        {unavailable ? (
          <p role="status" className="max-w-xs text-center text-sm text-amber-200">
            {SIGN_IN_UNAVAILABLE}
          </p>
        ) : (
          <SignIn
            routing="hash"
            fallbackRedirectUrl={APP_PATH}
            signUpFallbackRedirectUrl={APP_PATH}
            appearance={clerkAppearance}
          />
        )}
        {reason === 'upgrade' && <p className="mt-3 text-xs text-white/70">{SIGN_IN_UPGRADE_HINT}</p>}
        <p className="mt-4 text-xs text-white/60">Free tier includes 7 AI questions per day</p>
      </div>
    </div>
  )
}
