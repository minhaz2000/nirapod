/**
 * Family Plan (Premium idea), shown as a preview only: no server, no sync, no payment.
 * Status is what we tell judges and users honestly: "in progress" or "coming soon". Nothing here is live.
 */
import type { IconName } from '@/components/Icon';

export type FamilyStatus = 'progress' | 'soon';

export const FAMILY_FEATURES = [
  { id: 'checkin', icon: 'check', status: 'progress' },
  { id: 'voice', icon: 'mic', status: 'progress' },
  { id: 'remote', icon: 'users', status: 'progress' },
  { id: 'refill', icon: 'pill', status: 'soon' },
  { id: 'emergency', icon: 'ambulance', status: 'progress' },
  { id: 'plate', icon: 'plate', status: 'soon' },
  { id: 'visit', icon: 'doc', status: 'soon' },
  { id: 'story', icon: 'chart', status: 'soon' },
] as const satisfies ReadonlyArray<{ id: string; icon: IconName; status: FamilyStatus }>;

export type FamilyFeatureId = (typeof FAMILY_FEATURES)[number]['id'];

/** Nothing in the Family Plan is live yet: every feature is a preview. */
export const FAMILY_PLAN_LIVE = false;
