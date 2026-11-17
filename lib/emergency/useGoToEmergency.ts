'use client';

import { useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { DangerInput } from '@/lib/rules/danger-signs';
import { emergencyHref } from './navigate';

/** Returns a function that sends the user to the emergency page (keeping the current language). */
export function useGoToEmergency() {
  const router = useRouter();
  return useCallback((input: DangerInput = {}) => router.push(emergencyHref(input)), [router]);
}
