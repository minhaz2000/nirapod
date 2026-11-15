# notebooks/

Kaggle training notebooks (`.ipynb`) that export the ONNX models in `public/models/`. See `KAGGLE.md` for the
step-by-step Kaggle workflow.

## Data sources

**Check every licence on the dataset page before committing any of its files.** Never commit data whose licence
does not allow redistribution. Licence column: fill in after checking.

| Use | Dataset | Link | Licence |
|---|---|---|---|
| Food images | PUST Cafeteria Food (YOLO-seg ready) | https://data.mendeley.com/datasets/fn6yhzjz83/2 | TODO: verify |
| Food images | FoodBD (67 classes, polygons) | https://doi.org/10.17632/xh3ghf3jbg.2 | TODO: verify |
| Food nutrition | FoodNetBD | https://data.mendeley.com/datasets/23f7yxnvy7/1 | CC BY 4.0 |
| Skin | SkinDiseaseBD | https://data.mendeley.com/datasets/9ggd3shdr7 | TODO: verify |
| Skin | Benchmark Image Dataset for Scabies Detection | https://data.mendeley.com/datasets/6scrcbtzbx/1 · https://data.mendeley.com/datasets/mg6sb9b8x4/1 | TODO: verify |
| Skin | SkinDisNet | https://data.mendeley.com/datasets/yj3md44hxg/2 | TODO: verify |
| Medicines | Assorted Medicine Dataset of Bangladesh | https://github.com/ahmedshahriar/bd-medicine-scraper | TODO: verify |
| Handwriting (optional) | Doctor's Handwritten Prescription BD (Kaggle: mamun1113) | Kaggle | TODO: verify |

Notes: use only the **Original** folder of the scabies benchmark (augmented copies leak between train and test);
split SkinDisNet by patient.
