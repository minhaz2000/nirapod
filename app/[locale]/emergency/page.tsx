import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import PageShell from '@/components/PageShell';
import EmergencyActions from '@/components/EmergencyActions';
import { DANGER_SIGN_KEYS } from '@/lib/rules/danger-signs';

export default function EmergencyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('emergency');
  return (
    <PageShell title={t('title')}>
      <p className="text-lg">{t('intro')}</p>
      <EmergencyActions />
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-bold text-red-800">{t('dangerSignsTitle')}</h2>
        <ul className="list-disc space-y-1 pl-5">
          {DANGER_SIGN_KEYS.map((k) => (
            <li key={k}>{t(`dangerSigns.${k}`)}</li>
          ))}
        </ul>
      </section>
      <p className="text-sm text-slate-700">{t('free')}</p>
    </PageShell>
  );
}
