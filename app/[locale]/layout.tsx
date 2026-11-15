import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import '@fontsource/hind-siliguri/bengali-400.css';
import '@fontsource/hind-siliguri/bengali-600.css';
import '@fontsource/hind-siliguri/bengali-700.css';
import '@fontsource/hind-siliguri/latin-400.css';
import '@fontsource/hind-siliguri/latin-600.css';
import '@fontsource/hind-siliguri/latin-700.css';
import '../globals.css';
import { routing } from '@/i18n/routing';
import AppHeader from '@/components/AppHeader';
import EmergencyButton from '@/components/EmergencyButton';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'app' });
  return {
    title: { default: `${t('name')} — ${t('tagline')}`, template: `%s · ${t('name')}` },
    description: t('description'),
    applicationName: t('name'),
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: t('name'), statusBarStyle: 'default' },
    icons: { icon: '/icons/icon.svg', apple: '/icons/icon-192.png' },
  };
}

export const viewport: Viewport = {
  themeColor: '#115e59',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body className="min-h-dvh font-sans">
        <NextIntlClientProvider>
          <AppHeader />
          <main className="mx-auto max-w-md px-4 pt-4 pb-32">{children}</main>
          <EmergencyButton />
          <ServiceWorkerRegister />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
