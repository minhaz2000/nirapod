import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import PageShell from '@/components/PageShell';
import CameraCapture from '@/components/CameraCapture';
import ModelStatus from '@/components/ModelStatus';
import Notice from '@/components/Notice';

export default function DiabetesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('diabetes');
  return (
    <PageShell title={t('title')}>
      <Notice tone="danger">
        <p className="font-bold">{t('lowSugarTitle')}</p>
        <p>{t('lowSugarBody')}</p>
      </Notice>
      <p>{t('intro')}</p>
      <Notice>{t('trial')}</Notice>
      <CameraCapture livePreview />
      <ModelStatus name="food_seg" />
      <p className="text-sm text-slate-700">{t('disclaimer')}</p>
    </PageShell>
  );
}
