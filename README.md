# Nirapod — নিরাপদ

**Your Health, Our Priority** — a bilingual (Bangla + English), mobile-first PWA for people in Bangladesh.
One camera screen, four protections: Diabetes Companion, Private Skin Screening, Medicine Safety, Emergency Support.

See [`CLAUDE.md`](CLAUDE.md) for the full project guide and safety rules, and [`KAGGLE.md`](KAGGLE.md) for model training.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY and ANTHROPIC_MODEL (server-only)
npm run dev                  # http://localhost:3000 → redirects to /bn
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript) |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:e2e` | Playwright flows on a mobile viewport (`tests/e2e`; run `npm run build` first) |
| `npm run build:data` | Build SQLite reference data from `data/raw/` CSVs into `data/build/` |

The service worker (`public/sw.js`) registers only in production builds.
