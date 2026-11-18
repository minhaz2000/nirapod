import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Icon from '@/components/Icon';

export default function PageShell({ title, children }: { title: string; children: ReactNode }) {
  const t = useTranslations('nav');
  return (
    <section className="space-y-4">
      <Link href="/" className="inline-flex min-h-11 items-center text-teal-800 underline underline-offset-4">
        <Icon name="back" size={18} className="mr-1" />
        {t('back')}
      </Link>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {children}
    </section>
  );
}
