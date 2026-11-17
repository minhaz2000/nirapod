import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import PageShell from '@/components/PageShell';
import Notice from '@/components/Notice';
import EmergencyCenter from '@/components/emergency/EmergencyCenter';

export default function EmergencyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('emergency');
  return (
    <PageShell title={t('title')}>
      <p className="text-lg font-semibold">{t('intro')}</p>
      <Notice tone="info">
        <p>{t('about999')}</p>
        <p className="mt-1 text-sm">{t('cost')}</p>
      </Notice>
      <EmergencyCenter />
      <p className="text-sm text-slate-700">{t('free')}</p>
    </PageShell>
  );
}
