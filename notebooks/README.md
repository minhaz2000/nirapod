# notebooks/

Kaggle training notebooks (`.ipynb`) that export the ONNX models in `public/models/`. See `KAGGLE.md` for the
step-by-step Kaggle workflow.

## Data sources

**Check every licence on the dataset page before committing any of its files.** Never commit data whose licence
does not allow redistribution. Licence column: fill in after checking.

| Use | Dataset | Link | Licence |
|---|---|---|---|
| **Food images (in use: `food_seg.ipynb`)** | PUST Cafeteria Food Image Dataset, v2 (YOLO-seg ready) | https://data.mendeley.com/datasets/fn6yhzjz83/2 · DOI [10.17632/fn6yhzjz83.2](https://doi.org/10.17632/fn6yhzjz83.2) | **TODO: read the licence on the Mendeley page** (not reachable from the build environment) |
| Food images | FoodBD (67 classes, polygons) | https://doi.org/10.17632/xh3ghf3jbg.2 | TODO: verify |
| Food nutrition | FoodNetBD (in repo: `data/raw/nutrition/FoodNetBD.csv`; used by the Diabetes Companion via `config/food-class-map.csv`) | https://data.mendeley.com/datasets/23f7yxnvy7/1 | CC BY 4.0 — attribution required |
| Skin | SkinDiseaseBD | https://data.mendeley.com/datasets/9ggd3shdr7 | TODO: verify |
| Skin | Benchmark Image Dataset for Scabies Detection | https://data.mendeley.com/datasets/6scrcbtzbx/1 · https://data.mendeley.com/datasets/mg6sb9b8x4/1 | TODO: verify |
| Skin | SkinDisNet | https://data.mendeley.com/datasets/yj3md44hxg/2 | TODO: verify |
| **Medicines (in use)** | medicinedb — Bangladesh medicine database (SQLite/CSV/JSON) | https://github.com/WSAyan/medicinedb (pinned commit `a3863e9`) | **MIT**, © 2021 Wahid Sadique Ayan |
| Medicines (alternative, not used) | Assorted Medicine Dataset of Bangladesh | https://github.com/ahmedshahriar/bd-medicine-scraper | TODO: verify |
| Handwriting (optional) | Doctor's Handwritten Prescription BD (Kaggle: mamun1113) | Kaggle | TODO: verify |

Notes: use only the **Original** folder of the scabies benchmark (augmented copies leak between train and test);
split SkinDisNet by patient.

## Medicine reference data (medicinedb)

- **Source:** https://github.com/WSAyan/medicinedb, commit `a3863e9a1864ef7eb65a7a2b9d392ded171c62c0` (last commit 2021-09-29).
- **Licence:** MIT, Copyright (c) 2021 Wahid Sadique Ayan. The repository's licence covers the database files.
  The repo does not say where the underlying medicine information was originally collected from.
- **Age:** the repo README (2021) says the data was then "almost 4 years old". Prices are therefore approximate and
  likely lower than today's; the app says so wherever a price is shown.
- **Files used:** `csv/brands.csv`, `csv/companies.csv`, `csv/therapitics.csv`, `csv/therapitics_generics.csv`,
  and the `generic` table of `medicine.db`. `csv/generics.csv` is **not** used: its long free-text columns contain
  unquoted commas, so columns shift (e.g. Omeprazole's "indication" reads " prolonged use").
- **Where:** `data/raw/medicines/` (git-ignored). `npm run fetch:data` downloads the pinned files; `npm run build:data`
  fetches them if missing and writes `data/build/medicines.sqlite` (also git-ignored). The Vercel build runs
  `npm run build:data` first (see `vercel.json`).

## Food segmentation (`food_seg.ipynb`)

- **Dataset:** PUST Cafeteria Food Image Dataset, Mendeley Data, version 2 (published 2026-08-28),
  DOI [10.17632/fn6yhzjz83.2](https://doi.org/10.17632/fn6yhzjz83.2). 720 meal-platter photos taken 1 Aug – 5 Sep 2025
  at the Central Cafeteria of Pabna University of Science and Technology, on two phones (Realme GT Master Edition,
  OPPO A92). Annotations ship as YOLO_detect (boxes), YOLO_seg (polygons) and COCO JSON; the notebook uses YOLO_seg.
- **Licence:** not yet confirmed — Mendeley shows it under the dataset title. Record it here before committing any
  dataset files or publishing results. The images are **not** committed to this repository; Kaggle reads them from a
  private Kaggle dataset.
- **Dataset authors' caveat:** billing, portion, calorie or dietary assessment needs additional validated external
  information. Nirapod uses the model only to recognise foods and shows a green/amber/red signal, not grams.
- **Model:** Ultralytics YOLO11n-seg (AGPL-3.0 licensed code and weights; an Enterprise licence is needed to ship it
  in a closed-source product), fine-tuned for a fixed time budget on a Kaggle T4.
- **Result (v0.1.0, trained 2026-11-18):** mask mAP50 0.867, mask mAP50-95 0.764, box mAP50 0.884 on 108 test images;
  1,512 train / 108 val images; 16 classes; `min_confidence` 0.614 (max mean mask F1 on the test split).
- **Real-photo check (2026-11-18, two top-down home photos, `public/samples/plate-1.jpg` and `plate-2.jpg`):**
  the app's TypeScript pipeline matches Ultralytics on the same model (boxes identical, scores ±0.01, mask area ±2 %),
  but the model **missed rice on both plates** (plate 1: only a 0.26 "not sure"; plate 2: nothing), **labelled dal as
  "vegetable" (0.87)**, did not find a milk drink, and merged prawn curry and greens into a weak "chola". Uncorrected,
  plate 1 would read 30 g carbs / green instead of ~83 g / red after one-tap corrections. Likely cause: the PUST photos
  are cafeteria steel trays, these are styled home plates. Next training run: add home-style plates with rice and dal
  in bowls (and drinks), then re-check with `tests/unit/food-seg-real.test.ts` and `tests/e2e/plates.spec.ts`.
- **Outputs:** `food_seg.onnx` + `food_seg.json` → `public/models/`; `metrics.json`, `per_class_ap.csv`,
  `confusion_matrix*.png`, `sample_predictions.jpg` → keep as evidence for the submission.
