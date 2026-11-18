import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import PageShell from '@/components/PageShell';
import CameraCapture from '@/components/CameraCapture';
import ModelStatus from '@/components/ModelStatus';
import Notice from '@/components/Notice';
import Icon from '@/components/Icon';

export default function SkinPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('skin');
  return (
    <PageShell title={t('title')}>
      <Notice>
        <Icon name="lock" size={18} className="mr-2 align-[-3px]" />
        {t('privacy')}
      </Notice>
      <p>{t('intro')}</p>
      <CameraCapture livePreview />
      <ModelStatus name="skin_cls" />
      <p className="text-sm text-slate-700">{t('disclaimer')}</p>
    </PageShell>
  );
}
