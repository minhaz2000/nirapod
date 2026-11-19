import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import CameraCapture from '@/components/CameraCapture';
import Icon, { type IconName } from '@/components/Icon';

const MODULES = [
  { key: 'diabetes', href: '/diabetes', icon: 'plate', tone: 'border-green-700' },
  { key: 'skin', href: '/skin', icon: 'skin', tone: 'border-sky-700' },
  { key: 'medicine', href: '/medicine', icon: 'pill', tone: 'border-violet-700' },
  { key: 'emergency', href: '/emergency', icon: 'ambulance', tone: 'border-red-700' },
  { key: 'assistant', href: '/assistant', icon: 'chat', tone: 'border-teal-700' },
] as const satisfies ReadonlyArray<{ key: string; href: string; icon: IconName; tone: string }>;

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('home');
  const tf = useTranslations('family');

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
                <Icon name={m.icon} size={32} />
                <span className="text-lg font-bold">{t(`cards.${m.key}.title`)}</span>
                <span className="text-sm text-slate-700">{t(`cards.${m.key}.desc`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/family"
        data-testid="home-family-card"
        className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-dashed border-teal-700 bg-white p-4 hover:shadow-md"
      >
        <Icon name="users" size={28} className="shrink-0 text-teal-900" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{tf('homeCard.title')}</span>
          <span className="block text-sm text-slate-700">{tf('homeCard.desc')}</span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold">{tf('homeCard.badge')}</span>
      </Link>
    </div>
  );
}
