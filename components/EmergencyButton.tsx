import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Icon from '@/components/Icon';

/** Persistent, always-free emergency button shown on every page (safety rule 11). */
export default function EmergencyButton() {
  const t = useTranslations('emergency');
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-red-800 bg-white/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <Link
        href="/emergency"
        aria-label={t('buttonLabel')}
        data-testid="emergency-button"
        className="mx-auto flex min-h-14 max-w-md items-center justify-center gap-2 rounded-full bg-red-700 px-6 text-lg font-bold text-white shadow-lg hover:bg-red-800 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-900"
      >
        <Icon name="phone" size={22} />
        {t('button')}
      </Link>
    </div>
  );
}
