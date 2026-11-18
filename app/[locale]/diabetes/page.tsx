import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import PageShell from '@/components/PageShell';
import Notice from '@/components/Notice';
import DiabetesApp from '@/components/diabetes/DiabetesApp';

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
      <DiabetesApp />
      <p className="text-sm text-slate-700">{t('disclaimer')}</p>
    </PageShell>
  );
}
