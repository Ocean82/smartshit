/**
 * Bridge between the store (which applies pending actions) and the auth layer
 * (which owns the free-tier auto-fix count on the server). The allowance is taken
 * when the user clicks Apply, never when a fix is merely staged, so previewing
 * and rejecting a fix costs nothing and the server needs no refund endpoint.
 */
import { reserveAutoFixLocally, type AutoFixDecision } from '@/lib/featureGates'

type Reserver = () => Promise<AutoFixDecision>

let current: Reserver | null = null

/** Registered by <AutoFixGateSync /> (null on unmount). */
export function setAutoFixReserver(fn: Reserver | null): void {
  current = fn
}

/** Take one auto-fix slot. Unregistered = treat as a free user on the local counter. */
export function reserveAutoFixForApply(): Promise<AutoFixDecision> {
  return current ? current() : Promise.resolve(reserveAutoFixLocally(false))
}
