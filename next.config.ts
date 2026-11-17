import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  // Native module used only inside Node-runtime route handlers.
  serverExternalPackages: ['better-sqlite3'],
  // The SQLite file is read at runtime with fs, so tell output tracing to ship it with the medicine routes.
  outputFileTracingIncludes: {
    '/api/medicines/**/*': ['./data/build/medicines.sqlite'],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
