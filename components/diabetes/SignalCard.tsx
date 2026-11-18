'use client';

import { useFormatter, useTranslations } from 'next-intl';
import Icon from '@/components/Icon';
import type { Meal } from '@/lib/store/db';
import { useFoodName } from './useFoodName';

const STYLE = {
  green: 'border-green-700 bg-green-50 text-green-950',
  amber: 'border-amber-500 bg-amber-50 text-amber-950',
  red: 'border-red-700 bg-red-50 text-red-950',
} as const;
const DOT = { green: 'bg-green-700', amber: 'bg-amber-500', red: 'bg-red-700' } as const;

/** Green / amber / red with total carbs and ONE practical suggestion about the meal (never medicine). */
export default function SignalCard({ meal, dueAt, onAgain }: { meal: Meal; dueAt: number; onAgain: () => void }) {
  const t = useTranslations('diabetes');
  const format = useFormatter();
  const food = useFoodName();
  return (
    <section className={`space-y-3 rounded-2xl border-l-8 p-4 shadow-sm ${STYLE[meal.signal]}`} data-testid="meal-signal" data-signal={meal.signal}>
      <p className="flex items-center gap-3 text-xl font-bold">
        <span aria-hidden="true" className={`size-6 shrink-0 rounded-full ${DOT[meal.signal]}`} />
        {t(`signal.${meal.signal}`)}
      </p>
      <p className="text-lg">{t('signal.carbs', { carbs: meal.carbs })}</p>
      <p className="rounded-xl bg-white/70 p-3 text-lg font-semibold" data-testid="meal-suggestion">
        {t(`suggestions.${meal.suggestion}`)}
      </p>
      {meal.adjusted && meal.mainFood && (
        <p className="text-sm" data-testid="meal-adjusted">
          {t(`signal.${meal.adjusted}`, { food: food(meal.mainFood) })}
        </p>
      )}
      <p className="text-xs text-slate-700">{t('signal.estimate')}</p>
      <p className="flex items-center gap-2 text-sm" data-testid="meal-saved">
        <Icon name="clock" size={18} />
        {t('signal.saved', { time: format.dateTime(new Date(dueAt), { hour: 'numeric', minute: '2-digit' }) })}
      </p>
      <button type="button" onClick={onAgain} className="min-h-12 w-full rounded-xl border-2 border-current px-4 font-bold">
        {t('signal.again')}
      </button>
    </section>
  );
}
