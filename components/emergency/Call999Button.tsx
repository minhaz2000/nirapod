import { useTranslations } from 'next-intl';
import Icon from '@/components/Icon';

export default function Call999Button({ variant = 'page' }: { variant?: 'page' | 'alert' }) {
  const t = useTranslations('emergency');
  const style =
    variant === 'alert'
      ? 'bg-white text-red-800 hover:bg-red-50 focus-visible:outline-white'
      : 'bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-900';
  return (
    <a
      href="tel:999"
      data-testid={variant === 'alert' ? 'alert-call-999' : 'call-999'}
      className={`flex min-h-20 w-full items-center justify-center gap-3 rounded-2xl px-4 text-2xl font-bold shadow-md focus-visible:outline-4 focus-visible:outline-offset-2 ${style}`}
    >
      <Icon name="phone" size={28} /> {t('call999')}
    </a>
  );
}
