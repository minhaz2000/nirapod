import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import LanguageSwitch from './LanguageSwitch';
import Icon from '@/components/Icon';

export default function AppHeader() {
  const t = useTranslations();
  return (
    <header className="sticky top-0 z-40 print:hidden border-b border-slate-200 bg-white/95 backdrop-blur">
      <nav aria-label={t('nav.main')} className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-2">
        <Link href="/" className="flex min-h-11 flex-col justify-center">
          <span className="text-xl font-bold leading-tight text-teal-900">{t('app.name')}</span>
          <span className="text-xs leading-tight text-slate-700">{t('app.tagline')}</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            aria-label={t('nav.settings')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl text-slate-800 hover:bg-slate-100"
          >
            <Icon name="settings" size={24} />
          </Link>
          <LanguageSwitch />
        </div>
      </nav>
    </header>
  );
}
