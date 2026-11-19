import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import PageShell from '@/components/PageShell';
import Notice from '@/components/Notice';
import Icon from '@/components/Icon';
import { Link } from '@/i18n/navigation';
import pkg from '@/package.json';
import HowAiWorks from '@/components/about/HowAiWorks';

export default function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('about');
  return (
    <PageShell title={t('title')}>
      <p>{t('body')}</p>
      <Notice tone="warning">{t('guide')}</Notice>
      <Notice>{t('privacy')}</Notice>
      <HowAiWorks />
      <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm" data-testid="about-family">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Icon name="users" size={20} />
          {t('familyTitle')}
        </h2>
        <p>{t('family')}</p>
        <Link href="/family" className="inline-flex min-h-11 items-center font-semibold text-teal-800 underline underline-offset-4">
          {t('familyLink')}
        </Link>
      </section>
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <span className="font-semibold">{t('consultation')}</span>
        <span className="rounded-full bg-slate-200 px-3 py-1 text-sm">{t('comingSoon')}</span>
      </div>
      <p className="text-sm text-slate-600">{t('version', { version: pkg.version })}</p>
    </PageShell>
  );
}
