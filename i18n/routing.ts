import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['bn', 'en'],
  defaultLocale: 'bn',
  // Bangla is always the default, even when the phone's language is English; users switch explicitly.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
