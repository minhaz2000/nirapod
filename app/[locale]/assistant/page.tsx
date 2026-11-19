import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import PageShell from '@/components/PageShell';
import Assistant from '@/components/assistant/Assistant';

export default function AssistantPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('assistant');
  return (
    <PageShell title={t('title')}>
      <Assistant />
    </PageShell>
  );
}
