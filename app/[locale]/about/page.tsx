import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import PageShell from '@/components/PageShell';
import Notice from '@/components/Notice';
import pkg from '@/package.json';

export default function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('about');
  return (
    <PageShell title={t('title')}>
      <p>{t('body')}</p>
      <Notice tone="warning">{t('guide')}</Notice>
      <Notice>{t('privacy')}</Notice>
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <span className="font-semibold">{t('consultation')}</span>
        <span className="rounded-full bg-slate-200 px-3 py-1 text-sm">{t('comingSoon')}</span>
      </div>
      <p className="text-sm text-slate-600">{t('version', { version: pkg.version })}</p>
    </PageShell>
  );
}
