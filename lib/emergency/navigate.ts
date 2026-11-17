/**
 * Routing into Emergency Support from any module.
 *
 *   import { emergencyHref } from '@/lib/emergency/navigate';
 *   <Link href={emergencyHref({ glucoseMmol: 3.2 })}>…</Link>
 *
 * or, in a client component, `useGoToEmergency()` from '@/lib/emergency/useGoToEmergency'.
 * Signs passed here are pre-selected on the emergency page, which then opens the full-screen alert at once.
 */
import { assessDangerSigns, normaliseSelection, type DangerInput, type DangerSignId } from '@/lib/rules/danger-signs';

export const EMERGENCY_PATH = '/emergency';
export const SIGNS_PARAM = 'signs';

/** Locale-less href (use with the next-intl Link / router from '@/i18n/navigation'). */
export function emergencyHref(input: DangerInput = {}): string {
  const { triggered } = assessDangerSigns(input);
  return triggered.length ? `${EMERGENCY_PATH}?${SIGNS_PARAM}=${triggered.join(',')}` : EMERGENCY_PATH;
}

/** Parses the ?signs= query value; unknown ids are dropped. */
export function parseSignsParam(value: string | null | undefined): DangerSignId[] {
  return value ? normaliseSelection(value.split(',').map((s) => s.trim())) : [];
}
