# data/raw/nutrition/

`FoodNetBD.csv` — **FoodNetBD: A Bilingual, Disease-Annotated Nutrition dataset** (600 foods common in Bangladesh,
English + Bangla names, 56 columns), Mendeley Data, https://data.mendeley.com/datasets/23f7yxnvy7/1.
Licence: **CC BY 4.0** — redistribution allowed with attribution; the app credits it wherever nutrition values are
shown. Each row also cites its own original source (`Source_Citation`).

Committed (the licence allows it) because the Vercel build reads it: `npm run build:data` →
`data/build/nutrition.sqlite`. Mapping of model classes to rows: `config/food-class-map.csv`.
