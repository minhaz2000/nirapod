'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { EXPIRY } from '@/config/expiry';
import type { PackDates } from '@/lib/ocr/expiry';
import { expiryStatus } from '@/lib/rules/medicine';

/**
 * Expired / Expires within N months / OK until <month year>. When no expiry date was read: "Expiry date not
 * readable — please check the pack" (never a guess, and an unlabelled date is never used as the expiry).
 */
export default function ExpiryCard({ dates, today = new Date() }: { dates: PackDates; today?: Date }) {
  const t = useTranslations('medicine.scan.result');
  const format = useFormatter();
  const e = expiryStatus(dates, today);
  const monthYear = e.status === 'unknown' ? '' : format.dateTime(e.end, { month: 'long', year: 'numeric' });
  const tone = {
    expired: 'border-red-700 bg-red-50 text-red-900',
    expiresSoon: 'border-amber-600 bg-amber-50 text-amber-950',
    ok: 'border-green-700 bg-green-50 text-green-900',
    unknown: 'border-slate-500 bg-slate-50 text-slate-900',
  }[e.status];
  return (
    <section className={`space-y-1 rounded-2xl border-l-8 p-4 shadow-sm ${tone}`} data-testid="result-expiry" data-status={e.status}>
      <h3 className="text-sm font-semibold uppercase tracking-wide">{t('expiry')}</h3>
      <p className="text-xl font-bold" data-testid="expiry-headline">
        {e.status === 'ok' && t('expiryOk', { date: monthYear })}
        {e.status === 'expiresSoon' && t('expiresSoon', { months: EXPIRY.soonMonths })}
        {e.status === 'expired' && t('expired')}
        {e.status === 'unknown' && t('expiryUnknown')}
      </p>
      {e.status !== 'unknown' && <p>{t('expiryDate', { date: monthYear })}</p>}
      {e.status === 'expired' && <p className="font-semibold">{t('expiredAdvice')}</p>}
    </section>
  );
}
