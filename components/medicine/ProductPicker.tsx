'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { BrandMatch, Product } from '@/lib/medicine/repo';

interface Props {
  matches: BrandMatch[];
  initial: Product | null;
  onConfirm: (p: Product) => void;
}

/** The user confirms the detected brand, strength and form before anything is checked. */
export default function ProductPicker({ matches, initial, onConfirm }: Props) {
  const t = useTranslations('medicine.scan.confirm');
  const [selected, setSelected] = useState<Product | null>(initial);
  return (
    <div className="space-y-3">
      <p className="text-slate-800">{t('choose')}</p>
      <div role="radiogroup" aria-label={t('title')} className="max-h-[50vh] space-y-3 overflow-y-auto">
        {matches.map((m) => (
          <fieldset key={m.brand} className="space-y-2">
            <legend className="font-bold">{m.brand}</legend>
            {m.products.map((p) => {
              const on = selected?.id === p.id;
              return (
                <label
                  key={p.id}
                  data-testid={`product-${p.id}`}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${
                    on ? 'border-teal-800 bg-teal-50' : 'border-slate-300 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="product"
                    checked={on}
                    onChange={() => setSelected(p)}
                    className="size-5 shrink-0 accent-teal-800"
                  />
                  <span>
                    <span className="block font-semibold">
                      {p.brand} {p.strength} · {p.form}
                    </span>
                    <span className="block text-sm text-slate-700">
                      {[p.generic, p.manufacturer].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && onConfirm(selected)}
        data-testid="confirm-product"
        className="min-h-12 w-full rounded-xl bg-teal-800 px-4 font-bold text-white disabled:opacity-50"
      >
        {t('use')}
      </button>
    </div>
  );
}
