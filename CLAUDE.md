# Nirapod — Project Guide for Claude Code

Nirapod ("Your Health, Our Priority") is a bilingual (Bangla + English), mobile-first web app (PWA) for people in Bangladesh.
One camera screen, four protections:

1. **Diabetes Companion** — plate photo → Bangladeshi food recognition (segmentation) → portion estimate → green / amber / red signal, personalised from post-meal glucose readings.
2. **Private Skin Screening** — skin photo → scabies likelihood with confidence + heatmap → three-level guidance (home care / see a doctor soon / go to hospital now).
3. **Medicine Safety** — photos of reports, prescriptions and medicine packs → plain-language explanation, expiry check, duplicate-generic and interaction warnings, cheaper same-generic brands, "suspicious packaging" flags.
4. **Emergency Support** — rule-based danger signs → one tap to call 999, share location, nearby hospitals.

Built for the International AI Builders Congress 2026 (Idea to Unicorn track, HealthSphere AI domain).
Preliminary submission (needs a live demo link + ≤181 s YouTube video): **20 Nov 2026**. Congress Day: **26 Dec 2026**.

---

## Tech stack (do not change without asking)

- **Framework:** Next.js (App Router) + TypeScript (`strict: true`).
- **Styling:** Tailwind CSS, mobile-first, must work at 360 px width.
- **i18n:** `next-intl`, locales `bn` (default) and `en`. Every user-facing string lives in `messages/bn.json` and `messages/en.json`. Never hard-code UI text. A language switch is always visible.
- **On-device AI:** `onnxruntime-web` (WASM backend). Models live in `public/models/<name>.onnx`, each with `public/models/<name>.json` metadata: class names, input size, normalisation mean/std, `min_confidence`, model version.
- **Printed-text OCR:** `tesseract.js` in the browser (languages `eng` + `ben`).
- **User data:** stays on the device in IndexedDB via `dexie` (profile, meals, glucose readings, saved prescriptions, trial start date). No user accounts in the MVP. Settings has "Delete all my data", which wipes IndexedDB.
- **Reference data:** medicine database and food nutrition table are built from CSVs in `data/raw/` into read-only SQLite files in `data/build/` by `scripts/build-data.ts`, and read with `better-sqlite3` inside Node-runtime route handlers. This must work on Vercel.
- **Server AI:** Anthropic API (`@anthropic-ai/sdk`), called only from server route handlers, for (a) reading handwritten prescriptions and (b) writing plain-language explanations. Read `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` from env; never expose them to the client; never hard-code a model name.
- **Camera:** `<input type="file" accept="image/*" capture="environment">`, plus `getUserMedia` live preview where available.
- **PWA:** installable, offline shell; on-device features (food, skin, printed OCR, emergency rules) work without internet.
- **Tests:** Vitest for logic, Playwright for the four main flows (mobile viewport).
- **Deploy:** Vercel.

## Folder structure

```
app/[locale]/              pages: home (camera), diabetes, skin, medicine, emergency, settings, about
app/api/                   route handlers: explain, handwriting, medicines/search, medicines/alternatives, food/nutrition
components/                CameraCapture, ImageQualityCheck, SignalBadge, ConfidenceBar, HeatmapOverlay, LanguageSwitch, EmergencyButton, ...
lib/ai/                    onnx session loader, preprocessing, router.ts, food.ts, skin.ts, quality.ts
lib/ocr/                   tesseract wrapper; parsers for expiry, batch, price, registration no., report values
lib/rules/                 deterministic rules: medicine.ts, glucose.ts, danger-signs.ts, portion.ts, report-ranges.ts
lib/store/                 dexie database and typed helpers
lib/privacy/               redact.ts — removes names, phone numbers, IDs, addresses before any server call
config/                    clinical thresholds and curated lists (each file carries a "needs clinician review" header)
scripts/                   build-data.ts and other one-off scripts
data/raw/                  downloaded CSVs (git-ignored unless the licence allows redistribution)
data/build/                generated SQLite files
public/models/             onnx models + metadata json
notebooks/                 Kaggle training notebooks (.ipynb) that export the onnx models
messages/                  bn.json, en.json
tests/                     vitest + playwright
```

## Non-negotiable safety rules (each needs a test)

1. **Guide, never diagnose.** Copy says "possible" / "may", never "you have X".
2. **Never call a medicine fake or genuine.** Only "N suspicious signs found: …" or "No suspicious signs found".
3. **Never advise stopping, starting or changing any medicine or insulin dose.** If something looks inconsistent: "Ask your doctor or pharmacist; do not stop on your own."
4. **The doctor's written diagnosis on a prescription overrides any AI guess.**
5. **Uncertainty is shown, not hidden.** Every model output carries a confidence value. Below the model's `min_confidence`, show "Not sure — please see a doctor" instead of a label.
6. **Low blood sugar first.** A glucose reading below 3.9 mmol/L (70 mg/dL) shows emergency guidance (take something sweet now, call 999 if needed) and never suggests reducing food.
7. **Handwriting must be confirmed.** Anything read from a handwritten prescription is shown to the user to confirm or edit before it is used.
8. **The LLM only rephrases verified facts.** `/api/explain` receives structured results from the database and rules. Its system prompt forbids adding medical facts, and its output is checked: any medicine name, dose or number not present in the input causes a fallback to the template explanation.
9. **Privacy.** Skin photos never leave the device. Run `lib/privacy/redact.ts` before every server call. Nothing is stored on the server.
10. **Cheaper alternatives** must match generic name, strength and dosage form exactly, and always show "Confirm with your pharmacist".
11. **Emergency is always free, one tap away on every screen, and never behind a paywall.**
12. **Clinical thresholds live in `config/`**, never inline, and are marked for clinician review.

## Business rules

- Skin Screening, Medicine Safety and Emergency: free.
- Diabetes Companion: 7-week free trial from first use (stored locally), then a subscription screen (stub only, no real payment).
- Online doctor consultation: "Coming soon (Premium)".

## Coding conventions

- Small, pure functions in `lib/`; UI components stay thin.
- Every rule in `lib/rules/` has unit tests with Bangladeshi examples (e.g. Napa / paracetamol, Seclo / omeprazole, Metformin).
- If a model file is missing, show a clear "model not loaded yet" state; never crash.
- Glucose stored in mmol/L, displayed in the user's chosen unit (mmol/L or mg/dL).
- Accessibility: tap targets ≥ 44 px, high contrast, Bangla font `Hind Siliguri` or `Noto Sans Bengali`.
- A **demo mode** (toggle in Settings) loads sample images so the full flow can be shown on stage without real data.
- Commit after each completed step with a clear message. Run `npm run lint`, `npm test` and `npm run build` before saying a step is done.

## Data sources (details, links and licences in notebooks/README.md)

- Food images: PUST Cafeteria Food (YOLO-seg ready), FoodBD (67 classes, polygon annotations)
- Food nutrition: FoodNetBD (CC BY 4.0)
- Skin: SkinDiseaseBD, Benchmark Image Dataset for Scabies Detection, SkinDisNet
- Medicines: Assorted Medicine Dataset of Bangladesh (Kaggle; source github.com/ahmedshahriar/bd-medicine-scraper)
- Handwriting (optional classifier): Doctor's Handwritten Prescription BD (Kaggle: mamun1113)

Check each dataset's licence before committing its files; never commit data whose licence does not allow redistribution.
