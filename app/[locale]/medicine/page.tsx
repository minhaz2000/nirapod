import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import PageShell from '@/components/PageShell';
import CameraCapture from '@/components/CameraCapture';
import Notice from '@/components/Notice';

export default function MedicinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('medicine');
  return (
    <PageShell title={t('title')}>
      <p>{t('intro')}</p>
      <CameraCapture />
      <Notice tone="warning">{t('disclaimer')}</Notice>
      <p className="text-sm text-slate-700">{t('packaging')}</p>
    </PageShell>
  );
}
