'use client';

import { useTranslations } from 'next-intl';
import Icon from '@/components/Icon';

const FEATURES = ['meals', 'learning', 'reminders', 'log', 'report', 'family'] as const;
const SOON = ['ramadan', 'voice', 'doctor'] as const;

/** Stub subscription screen (no payment). Emergency and low-sugar help are never behind it (rule 11). */
export default function PremiumScreen({ ended }: { ended: boolean }) {
  const t = useTranslations('diabetes.premium');
  return (
    <section className="space-y-3 rounded-2xl border-2 border-teal-800 bg-white p-4 shadow-sm" data-testid="premium-screen">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Icon name="star" size={22} />
        {t('title')}
      </h2>
      {ended && (
        <p className="font-semibold text-amber-900" data-testid="trial-ended">
          {t('trialEnded')}
        </p>
      )}
      <p>{t('intro')}</p>
      <ul className="space-y-1">
        {FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Icon name="check" size={18} className="mt-1 text-green-800" />
            {t(`features.${f}`)}
          </li>
        ))}
      </ul>
      <p className="font-semibold">{t('soon')}:</p>
      <ul className="list-disc space-y-1 pl-6" data-testid="premium-soon">
        {SOON.map((s) => (
          <li key={s}>{t(`soonList.${s}`)}</li>
        ))}
      </ul>
      <button type="button" disabled className="min-h-12 w-full rounded-xl bg-teal-800 px-4 font-bold text-white opacity-60">
        {t('subscribe')}
      </button>
      <p className="text-sm text-slate-700">{t('free')}</p>
    </section>
  );
}
