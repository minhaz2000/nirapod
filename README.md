# Nirapod — নিরাপদ

**Your Health, Our Priority · আপনার স্বাস্থ্য, আমাদের অগ্রাধিকার**

Nirapod is a free, bilingual (Bangla + English), mobile-first web app (PWA) for people in Bangladesh.
One camera screen, four protections:

| Module | What it does | Status |
|---|---|---|
| **Emergency Support** | Tap-to-select danger signs (chest pain, FAST stroke signs, breathing, unconsciousness, bleeding, low blood sugar) → full-screen alert with one-tap 999, share location, nearby hospitals | ✅ built |
| **Medicine Safety** | Scan a medicine pack (on-device OCR) → what it is, expiry, suspicious signs, cheaper same-generic brands. Explain a printed lab report and a prescription together: double doses, interactions, allergy / pregnancy flags, plain-language explanation | ✅ built |
| **Diabetes Companion** | Plate photo → on-device food recognition (16 Bangladeshi foods) → portion check → green / amber / red signal, personalised from 2-hour glucose readings | ✅ core built (Full care in progress) |
| **Private Skin Screening** | Skin photo → scabies likelihood with confidence, on the phone only | ⏳ model not trained yet (the page shows "model not loaded yet") |

Built for the International AI Builders Congress 2026 (Idea to Unicorn track, HealthSphere AI). Project guide and
rules: [`CLAUDE.md`](CLAUDE.md). Model training on Kaggle: [`KAGGLE.md`](KAGGLE.md), [`notebooks/`](notebooks/).

> Nirapod gives guidance only. It does not diagnose and does not replace a doctor. In an emergency, call **999**.

---

## Run locally

Requirements: **Node.js 22** and npm.

```bash
npm install                  # also copies OCR + ONNX Runtime files into public/tesseract and public/ort
npm run build:data           # downloads the medicine data and builds data/build/medicines.sqlite
cp .env.example .env.local   # optional: AI keys (see below)
npm run dev                  # http://localhost:3000 → /bn
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server (the service worker only runs in production) |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:e2e` | Playwright flows on a phone-sized screen (`tests/e2e`; run `npm run build:data` and `npm run build` first) |
| `npm run fetch:data` | Download the medicine data (pinned GitHub commit) into `data/raw/medicines/` |
| `npm run build:data` | Build `data/build/medicines.sqlite` (fetches the raw files if missing) |

**Demo mode** (Settings → Demo mode) adds sample medicine packs, a sample lab report and a sample prescription, so
every flow can be shown on stage without real data or an API key.

## Environment variables

Both are **optional** and **server-only** (never prefixed with `NEXT_PUBLIC_`). Without them everything still
works: prescriptions are typed or picked from the medicine list, and explanations use the built-in template.

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `/api/handwriting`, `/api/explain` | Anthropic API key |
| `ANTHROPIC_MODEL` | same | Model id, e.g. `claude-opus-5-5` (no model name is hard-coded) |

## Deploying (Vercel)

- `vercel.json` sets the build command to `npm run build:data && npm run build`, so the medicine database is
  built on every deploy (Vercel builds have internet access; the raw files come from a pinned GitHub commit).
- `next.config.ts` ships `data/build/*.sqlite` with every API route (better-sqlite3, Node runtime).
- Models in `public/models/` are static files served by Vercel's CDN, not by functions. Weights are requested as
  `food_seg.onnx?v=<version>` and cached for a year (`immutable`); the `.json` metadata is always revalidated, so
  bumping `version` in the json rolls out a new model at once. The app shows the model size, downloads it on tap with
  a progress bar, and keeps it for offline use.
- Node version: `22.x` (`package.json` → `engines`).

## Datasets, models and licences

| What | Source | Licence | In this repo? |
|---|---|---|---|
| Medicine database (brands, generics, prices, pregnancy categories) | [WSAyan/medicinedb](https://github.com/WSAyan/medicinedb), commit `a3863e9` (last updated 2021-09; prices are approximate and old) | MIT © 2021 Wahid Sadique Ayan | No — fetched at build time (`data/raw/` is git-ignored) |
| Food images for `food_seg` | PUST Cafeteria Food Image Dataset, Mendeley Data v2, DOI [10.17632/fn6yhzjz83.2](https://doi.org/10.17632/fn6yhzjz83.2) | **To confirm** on the Mendeley page | No — trained on Kaggle |
| Food nutrition | FoodNetBD (bilingual, disease-annotated nutrition table, 600 foods); mapping of the 16 model classes in `config/food-class-map.csv` | CC BY 4.0 (attribution shown in the app) | Yes — `data/raw/nutrition/FoodNetBD.csv` → `data/build/nutrition.sqlite` |
| Food segmentation model `public/models/food_seg.onnx` | Ultralytics YOLO11n-seg fine-tuned in [`notebooks/food_seg.ipynb`](notebooks/food_seg.ipynb): mask mAP50 0.867, mAP50-95 0.764 on 108 test images, 16 classes | **AGPL-3.0** (Ultralytics code and weights); a closed-source product needs an Ultralytics Enterprise licence | Yes (11.7 MB) |
| OCR language data (eng, ben) | `@tesseract.js-data`, tessdata 4.0.0_best_int | Apache-2.0 | No — copied from `node_modules` |
| ONNX Runtime Web | `onnxruntime-web` | MIT | No — copied from `node_modules` |
| Bangla font | Hind Siliguri (`@fontsource/hind-siliguri`) | SIL OFL 1.1 | No — npm |

Details, citations and notes on each dataset: [`notebooks/README.md`](notebooks/README.md).
Sample images in `public/samples/` are generated by scripts in `scripts/`; all names on them are fictional.

## Safety rules (from CLAUDE.md)

Every rule has tests in `tests/`.

1. **Guide, never diagnose** — copy says "possible" / "may"; tests reject "you have X" in all messages and AI text.
2. **Never call a medicine fake or genuine** — only "N suspicious signs found: …" or "No suspicious signs found".
3. **Never advise stopping, starting or changing a medicine or insulin dose** — "Ask your doctor or pharmacist; do not stop on your own."
4. **The doctor's written diagnosis overrides any AI guess** — shown first, as written.
5. **Uncertainty is shown** — every model output has a confidence; below the model's `min_confidence`: "Not sure — please see a doctor".
6. **Low blood sugar first** — glucose below 3.9 mmol/L (70 mg/dL) shows emergency guidance, never "eat less".
7. **Handwriting must be confirmed** — every line read from a handwritten prescription is confirmed or edited before use.
8. **The LLM only rephrases verified facts** — `/api/explain` gets structured results only; any medicine name or number not in the input, dose advice or diagnosis → template explanation.
9. **Privacy** — skin photos never leave the phone; prescription photos have their header cropped off; text is redacted (`lib/privacy/redact.ts`) before every server call; nothing is stored on the server; personal data stays in IndexedDB and "Delete all my data" wipes it.
10. **Cheaper alternatives** match generic, strength and dosage form exactly, with "Confirm with your pharmacist".
11. **Emergency is free and one tap away on every screen.**
12. **Clinical thresholds live in `config/`**, each marked "needs clinician review" (or pharmacist review).

## Project layout

```
app/[locale]/   pages (bn default, en)        app/api/      route handlers (Node runtime)
components/     UI                            config/       thresholds and curated lists (reviewed by clinicians)
lib/ai          on-device models               lib/ocr       tesseract.js + parsers (expiry, batch, price, reports)
lib/rules       deterministic safety rules     lib/explain   template, input check, AI output validator
lib/privacy     redaction                      lib/store     IndexedDB (dexie)
messages/       bn.json, en.json              notebooks/    Kaggle training notebooks
scripts/        data build, sample images      tests/        Vitest + Playwright
```
