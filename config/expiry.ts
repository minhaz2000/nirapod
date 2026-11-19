/**
 * NEEDS PHARMACIST REVIEW — when a medicine pack's expiry is shown as "expires soon".
 * The status is information for the user, not a suspicious sign. Placeholder value set by the product owner.
 */
export const EXPIRY = {
  /** An expiry within this many calendar months from today is shown as "Expires within N months". */
  soonMonths: 3,
} as const;
