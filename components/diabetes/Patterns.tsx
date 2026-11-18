'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LEARNING } from '@/config/meal-signal';
import { formatGlucose, type GlucoseUnit } from '@/lib/rules/glucose';
import type { FoodPattern } from '@/lib/rules/meal-signal';
import { patternsFor } from '@/lib/store/diabetes';
import { useFoodName } from './useFoodName';

/** Per-food 2-hour patterns kept on the phone; a food's signal changes after LEARNING.minReadings readings. */
export default function Patterns({ personId, unit, fasting, refresh }: { personId: string; unit: GlucoseUnit; fasting: number; refresh: number }) {
  const t = useTranslations('diabetes.patterns');
  const ts = useTranslations('settings');
  const food = useFoodName();
  const [patterns, setPatterns] = useState<FoodPattern[] | null>(null);

  useEffect(() => {
    let alive = true;
    patternsFor(personId, fasting).then((p) => alive && setPatterns(p));
    return () => {
      alive = false;
    };
  }, [personId, fasting, refresh]);

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm" data-testid="patterns">
      <h2 className="text-xl font-bold">{t('title')}</h2>
      <p className="text-sm text-slate-700">{t('intro', { min: LEARNING.minReadings })}</p>
      {patterns && patterns.length === 0 && <p>{t('none')}</p>}
      <ul className="space-y-2">
        {patterns?.map((p) => (
          <li key={p.food} className="rounded-xl border-2 border-slate-200 p-3" data-testid="pattern" data-adjustment={p.adjustment ?? 'none'}>
            <p className="font-semibold">{t('line', { food: food(p.food), n: p.readings, avg: formatGlucose(p.average2h, unit), unit: ts(unit) })}</p>
            <p className={`text-sm ${p.adjustment === 'stricter' ? 'font-semibold text-red-800' : p.adjustment === 'relaxed' ? 'text-green-800' : 'text-slate-700'}`}>
              {p.readings < LEARNING.minReadings
                ? t('collecting', { left: LEARNING.minReadings - p.readings })
                : p.adjustment
                  ? t(p.adjustment)
                  : t('noChange')}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
