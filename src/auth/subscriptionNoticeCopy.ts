export type SubscriptionNoticeCopy = {
  message: string
  action: string
}

const COPY: Record<string, SubscriptionNoticeCopy> = {
  canceled: {
    message: 'Your Pro subscription was canceled, so Pro features are paused.',
    action: 'Resubscribe',
  },
  unpaid: {
    message: "Your last payment couldn't be processed, so Pro features are paused.",
    action: 'Update payment method',
  },
  incomplete: {
    message: "Your subscription isn't active yet, so Pro features are paused.",
    action: 'Finish checkout',
  },
  incomplete_expired: {
    message: "Your subscription isn't active yet, so Pro features are paused.",
    action: 'Finish checkout',
  },
  paused: {
    message: "Your subscription isn't active yet, so Pro features are paused.",
    action: 'Resume subscription',
  },
  lapsed: {
    message: 'Your Pro subscription is no longer active, so Pro features are paused.',
    action: 'Resubscribe',
  },
}

/**
 * Copy for the revocation banner. Returns null for unknown or missing reasons:
 * an `unknown` reason means Stripe could not be reached, and a banner implying
 * the user lost their plan because of our own outage would be a lie.
 */
export function subscriptionNoticeCopy(
  reason: string | null | undefined,
): SubscriptionNoticeCopy | null {
  const copy = reason ? COPY[reason] : undefined
  if (!copy) return null
  return copy
}