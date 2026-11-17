/** Where the medicine reference data comes from. Pinned to a commit so builds are reproducible. */
export const MEDICINE_SOURCE = {
  name: 'medicinedb (WSAyan)',
  url: 'https://github.com/WSAyan/medicinedb',
  commit: 'a3863e9a1864ef7eb65a7a2b9d392ded171c62c0',
  licence: 'MIT (Copyright (c) 2021 Wahid Sadique Ayan)',
  /** Last commit to the dataset. Its README (2021) says the data was then "almost 4 years old". */
  lastUpdated: '2021-09',
  rawDir: 'data/raw/medicines',
  /** Files used by scripts/build-data.ts. generics.csv is not used: its free-text columns are unquoted and shift. */
  files: [
    'csv/brands.csv',
    'csv/companies.csv',
    'csv/therapitics.csv',
    'csv/therapitics_generics.csv',
    'medicine.db',
    'LICENSE',
  ],
} as const;
