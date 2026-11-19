'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Icon from '@/components/Icon';

const SOON = ['ramadan', 'voice', 'doctor'] as const;

/**
 * Premium screen (not available yet: no payment, no sign-up). Shown on Premium tabs after the 7-week trial.
 * The plate signal, sugar entry, low-sugar help and Emergency are never behind it (rule 11).
 */
export default function PremiumScreen({ ended }: { ended: boolean }) {
  const t = useTranslations('diabetes.premium');
  const tf = useTranslations('family');
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
      <Link
        href="/family"
        data-testid="premium-family-link"
        className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-teal-800 p-3 font-bold text-teal-900 hover:bg-teal-50"
      >
        <Icon name="users" size={24} />
        <span className="flex-1">
          {t('family')}
          <span className="block text-sm font-normal text-slate-700">{tf('headline')}</span>
        </span>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-800">{tf('status.soon')}</span>
      </Link>
      <p className="font-semibold">{t('soon')}:</p>
      <ul className="list-disc space-y-1 pl-6" data-testid="premium-soon">
        {SOON.map((s) => (
          <li key={s}>{t(`soonList.${s}`)}</li>
        ))}
      </ul>
      <button type="button" disabled data-testid="premium-coming-soon" className="min-h-12 w-full cursor-not-allowed rounded-xl bg-slate-300 px-4 font-bold text-slate-700">
        {t('subscribe')}
      </button>
      <p className="text-sm text-slate-700">{t('free')}</p>
    </section>
  );
}
