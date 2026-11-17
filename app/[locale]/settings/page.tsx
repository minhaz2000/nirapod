import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import PageShell from '@/components/PageShell';
import SettingsForm from '@/components/SettingsForm';

export default function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('settings');
  return (
    <PageShell title={t('title')}>
      <SettingsForm />
    </PageShell>
  );
}
