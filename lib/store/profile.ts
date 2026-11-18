import type { HealthProfile } from '@/lib/rules/prescription';
import { getDb } from './db';

export const EMPTY_PROFILE: HealthProfile = { allergies: [], pregnant: false };

/** Health profile for medicine checks. Stored only in IndexedDB on this phone. */
export async function getHealthProfile(): Promise<HealthProfile> {
  const p = await getDb().profile.get('me');
  return { allergies: p?.allergies ?? [], pregnant: p?.pregnant ?? false };
}

export function parseAllergies(text: string): string[] {
  return [...new Set(text.split(/[,،;\n]+/).map((a) => a.trim()).filter((a) => a.length >= 2))].slice(0, 30);
}

export async function saveHealthProfile(profile: HealthProfile): Promise<void> {
  const db = getDb();
  const existing = await db.profile.get('me');
  await db.profile.put({ ...(existing ?? { createdAt: Date.now() }), id: 'me', allergies: [...profile.allergies], pregnant: profile.pregnant });
}
