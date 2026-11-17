'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

/** Always-visible language switch (bn ⇄ en). */
export default function LanguageSwitch() {
  const t = useTranslations('language');
  const locale = useLocale();
  const pathname = usePathname();
  const other = locale === 'bn' ? 'en' : 'bn';
  return (
    <Link
      href={pathname}
      locale={other}
      hrefLang={other}
      data-testid="language-switch"
      aria-label={`${t('label')}: ${t('switchTo')}`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-teal-800 px-4 font-semibold text-teal-900 hover:bg-teal-50"
    >
      {t('switchTo')}
    </Link>
  );
}
