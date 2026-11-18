/** Schema of data/build/medicines.sqlite — shared by scripts/build-data.ts and the tests' fixture database. */
export const MEDICINE_SCHEMA = `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE generics (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL,
    indication TEXT, drug_class TEXT,
    pregnancy_category TEXT
  );
  CREATE TABLE manufacturers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL);
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    brand TEXT NOT NULL, brand_key TEXT NOT NULL,
    generic_id INTEGER REFERENCES generics(id), generic_key TEXT,
    manufacturer_id INTEGER REFERENCES manufacturers(id), manufacturer TEXT,
    form TEXT NOT NULL, form_key TEXT NOT NULL,
    strength TEXT NOT NULL, strength_key TEXT NOT NULL,
    unit_price REAL, unit TEXT,
    packs_json TEXT NOT NULL
  );
`;

export const MEDICINE_INDEXES = `
  CREATE INDEX idx_products_brand ON products(brand_key);
  CREATE INDEX idx_products_generic ON products(generic_key);
  CREATE INDEX idx_products_alternatives ON products(generic_key, strength_key, form_key, unit_price);
  CREATE INDEX idx_generics_name ON generics(name_key);
`;
