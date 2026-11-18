import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  // Native module used only inside Node-runtime route handlers.
  serverExternalPackages: ['better-sqlite3'],
  // SQLite files are opened at runtime with fs (better-sqlite3), so output tracing cannot see them: ship them with
  // every API route (/api/medicines/* query them; /api/explain checks medicine names against them).
  outputFileTracingIncludes: {
    '/api/**/*': ['./data/build/*.sqlite'],
  },
  async headers() {
    const year = 'public, max-age=31536000, immutable';
    return [
      // Model weights are requested as /models/<name>.onnx?v=<version>, so they never change under a URL.
      { source: '/models/:file*.onnx', headers: [{ key: 'Cache-Control', value: year }] },
      // Model metadata is small and must be revalidated, so a new model version is picked up at once.
      { source: '/models/:file*.json', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
      // onnxruntime-web WASM lives under its version number.
      { source: '/ort/:path*', headers: [{ key: 'Cache-Control', value: year }] },
      // OCR files are replaced only on dependency upgrades.
      { source: '/tesseract/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }] },
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
