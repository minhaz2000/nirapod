/**
 * NEEDS PHARMACIST REVIEW — how sure the app must be before it names the medicine in a pack photo.
 * The brand must match the medicine database AND at least one printed detail (generic, strength, form or
 * manufacturer) must agree; anything that contradicts the pack rules a candidate out. Otherwise the user chooses.
 */
export const PACK_IDENTIFY = {
  /** Brand score at or below this counts as a strong brand match (0 = exact, also ignoring spaces; 2 = one typo). */
  strongBrandMaxScore: 2,
  /** Candidates with a worse brand score than this are not offered at all (unless the generic matches). */
  weakBrandMaxScore: 4,
  /** Printed details that must agree for a strong match. */
  minCorroborations: 1,
  /** The best candidate must beat every other plausible one by at least this many points. */
  minMargin: 2,
  /** Extra brand-score penalty per position down the "largest text first" list (the brand is usually biggest). */
  prominencePenalty: 0.4,
  /** How many candidates to offer when not sure. */
  offer: 3,
} as const;
