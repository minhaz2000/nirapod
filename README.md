# Nirapod — নিরাপদ

**Your Health, Our Priority · আপনার স্বাস্থ্য, আমাদের অগ্রাধিকার**

Nirapod is a free, bilingual (Bangla + English), mobile-first web app (PWA) for people in Bangladesh.
One camera screen, four protections:

| Module | What it does | Status |
|---|---|---|
| **Emergency Support** | Tap-to-select danger signs (chest pain, FAST stroke signs, breathing, unconsciousness, bleeding, low blood sugar) → full-screen alert with one-tap 999, share location, nearby hospitals | ✅ built |
| **Medicine Safety** | Scan a medicine pack (on-device OCR) → what it is, expiry, suspicious signs, cheaper same-generic brands. Explain a printed lab report and a prescription together: double doses, interactions, allergy / pregnancy flags, plain-language explanation | ✅ built |
| **Diabetes Companion** | Plate photo → on-device food recognition (16 Bangladeshi foods) → one-tap portion check → green / amber / red signal, personalised from 2-hour glucose readings. Full care: meal / walk / medicine / check-up reminders, glucose charts, printable doctor report, family mode, weekly summary | ✅ built (7-week trial, then a Premium stub; sugar entry and low-sugar help always free) |
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

**Demo mode** (Settings → Demo mode) adds sample medicine packs, a sample lab report, a sample prescription and, in
the Diabetes Companion, a demo profile with two weeks of sample glucose, meal and medicine data, so every flow can be
shown on stage without real data or an API key. Demo plate photos go in `public/samples/plate-1.jpg` and
`plate-2.jpg`; their buttons appear only when the files exist.

## Environment variables

All are **optional** and **server-only** (never prefixed with `NEXT_PUBLIC_`). Without them everything still
works: medicine names are typed with autocomplete from the local medicine database (brand and generic, Latin or
Bangla script), a printed prescription can be read on the phone and matched to the closest medicine names
("Metfrmin" → Metformin), and explanations use the built-in template. Every suggestion is confirmed by the user.

| Variable | Used by | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `/api/handwriting`, `/api/explain` | `anthropic` or `gemini`: which provider to use when both are set up |
| `ANTHROPIC_API_KEY` | same | Anthropic API key |
| `ANTHROPIC_MODEL` | same | Anthropic model id (no model name is hard-coded) |
| `GEMINI_API_KEY` | same | Google Gemini API key (Google AI Studio) |
| `GEMINI_MODEL` | same | Gemini model id, e.g. a current Flash model from AI Studio (no model name is hard-coded) |

**Which provider is used** (`lib/server/llm-select.ts`): a provider counts only when both its key and its model
are set. `LLM_PROVIDER` picks one of the configured providers; if it names one that is not configured, or is not
set, the configured one is used (Anthropic first if both are). The About page and the medicine page show the
provider's name (never the key or model). Both providers get exactly the same input and the same checks:
the prescription header is cropped and text is redacted before sending, the user agrees in a consent note before a
photo is sent, every line read is confirmed by the user (rule 7), and `/api/explain` output that adds any medicine,
number, dose advice or diagnosis is replaced by the template (rule 8).

**Medicine packs** (`/api/pack/read`, then `/api/medicines/identify`): after a consent note, the pack photo is read
by the same provider (JSON only: brand, generic, strength, form, manufacturer, expiry and manufacturing dates, batch,
DAR number and the exact text seen). Without a key or internet, the pack is read on the phone with tesseract.js.
Either way the answer is verified against the medicine database (`lib/medicine/identify.ts`): brand first (two-word
brands such as "No Pain" are also matched without spaces), then generic and salt, strength, dosage form and
manufacturer; a candidate that contradicts the pack loses. Strong match → the medicine; weak → the user chooses from
the top 3 or types the name; none → "not in our medicine list", with the expiry check still shown. Dates are taken
only next to an EXP / MFG label; thresholds are in `config/expiry.ts` and `config/pack-identify.ts`.

**Privacy note on Gemini:** on Google's free (unpaid) tier, Google may use submitted content to improve its
products and human reviewers may read it. For real patient data, use a paid (billing-enabled) Gemini project, or
Anthropic, under terms that do not use API data for training.

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
12. **Clinical thresholds live in `config/`**, each marked "needs clinician review" (or pharmacist / nutritionist review):
    `glucose.ts`, `glucose-targets.ts`, `meal-signal.ts`, `checkups.ts`, `report-ranges.ts`, `interactions.ts`,
    `allergy-groups.ts`, `medicine-test-links.ts`, `medicine-checks.ts`, `danger-signs.ts`, `portion.ts`,
    `food-class-map.csv`.

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
