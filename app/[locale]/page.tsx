import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import CameraCapture from '@/components/CameraCapture';

const MODULES = [
  { key: 'diabetes', href: '/diabetes', icon: '🍛', tone: 'border-green-700' },
  { key: 'skin', href: '/skin', icon: '🩹', tone: 'border-sky-700' },
  { key: 'medicine', href: '/medicine', icon: '💊', tone: 'border-violet-700' },
  { key: 'emergency', href: '/emergency', icon: '🚑', tone: 'border-red-700' },
] as const;

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('home');

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <CameraCapture size="large" label={t('cameraButton')} livePreview />
        <p className="text-center text-slate-700">{t('cameraHint')}</p>
      </section>

      <section className="space-y-3">
        <h1 className="text-xl font-bold">{t('modulesTitle')}</h1>
        <ul className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          {MODULES.map((m) => (
            <li key={m.key}>
              <Link
                href={m.href}
                data-testid={`module-${m.key}`}
                className={`flex h-full min-h-28 flex-col gap-1 rounded-2xl border-l-8 bg-white p-4 shadow-sm hover:shadow-md ${m.tone}`}
              >
                <span aria-hidden="true" className="text-3xl">
                  {m.icon}
                </span>
                <span className="text-lg font-bold">{t(`cards.${m.key}.title`)}</span>
                <span className="text-sm text-slate-700">{t(`cards.${m.key}.desc`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
