import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import PageShell from '@/components/PageShell';
import FamilyPlan from '@/components/family/FamilyPlan';

export default function FamilyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('family');
  return (
    <PageShell title={t('title')}>
      <FamilyPlan />
    </PageShell>
  );
}
