import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);
/** Second app server with Gemini "configured" against a local mock (tests/e2e/mock-gemini.mjs). */
const AI_PORT = Number(process.env.AI_PORT ?? 3101);
const MOCK_PORT = 3199;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] }, testIgnore: /\.ai\.spec\.ts$/ },
    { name: 'ai-mocked', use: { ...devices['Pixel 5'], baseURL: `http://localhost:${AI_PORT}` }, testMatch: /\.ai\.spec\.ts$/ },
  ],
  webServer: [
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/bn`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'node tests/e2e/mock-gemini.mjs',
      url: `http://localhost:${MOCK_PORT}/health`,
      env: { MOCK_GEMINI_PORT: String(MOCK_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npx next start -p ${AI_PORT}`,
      url: `http://localhost:${AI_PORT}/bn`,
      env: {
        LLM_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL: 'mock-flash',
        LLM_TEST_GEMINI_BASE_URL: `http://localhost:${MOCK_PORT}/v1beta`,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
