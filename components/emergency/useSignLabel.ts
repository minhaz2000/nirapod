'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { LOW_GLUCOSE_DANGER_BELOW_MMOL, type DangerSignId } from '@/config/danger-signs';
import { fromMmol } from '@/lib/rules/glucose';

/** Thresholds in copy come from config, never hard-coded in messages. */
export const LOW_GLUCOSE_PARAMS = {
  mmol: LOW_GLUCOSE_DANGER_BELOW_MMOL,
  mgdl: Math.round(fromMmol(LOW_GLUCOSE_DANGER_BELOW_MMOL, 'mgdl')),
};

export function useSignLabel() {
  const t = useTranslations('emergency.signs');
  return useCallback(
    (id: DangerSignId) => (id === 'lowGlucose' ? t('lowGlucose.label', LOW_GLUCOSE_PARAMS) : t(`${id}.label`)),
    [t],
  );
}
