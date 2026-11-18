'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { searchMedicines } from '@/lib/medicine/client';
import { strengthKey } from '@/lib/medicine/normalise';
import type { Product } from '@/lib/medicine/repo';
import type { RxLine } from './types';
import Icon from '@/components/Icon';

interface Props {
  line: RxLine;
  /** Updates are functions of the latest line, so lookups finishing in any order never overwrite each other. */
  onChange: (update: (line: RxLine) => RxLine) => void;
  onRemove: () => void;
}

/** Strength digits for matching "500 mg" against "500mg". */
const digits = (s: string) => strengthKey(s).replace(/[^0-9.]/g, '');

/** One prescription line: edit, match to the medicine database, then CONFIRM (rule 7). */
export default function RxLineEditor({ line, onChange, onRemove }: Props) {
  const t = useTranslations('medicine.explain.rx');
  const [candidates, setCandidates] = useState<Product[] | null>(null);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [query, setQuery] = useState(line.medicine);
  const lowConfidence = line.confidence !== null && line.confidence < 0.7;

  // Look up the medicine name in the database (debounced). The name is redacted before it is sent.
  useEffect(() => {
    if (line.confirmed) return;
    const q = query.trim();
    if (q.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      searchMedicines(q)
        .then(({ results }) => {
          if (!alive) return;
          const products = results.slice(0, 2).flatMap((b) => b.products).slice(0, 12);
          setCandidates(products);
          setSearchedFor(q);
          if (products.length) {
            onChange((l) => {
              if (l.product) return l;
              const want = digits(l.strength);
              return { ...l, product: products.find((p) => want && digits(p.strength) === want) ?? products[0]! };
            });
          }
        })
        .catch(() => {
          if (!alive) return;
          setCandidates([]);
          setSearchedFor(q);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-search only when the typed name changes
  }, [query, line.confirmed]);

  const shown = query.trim().length >= 2 ? candidates : null;
  // Confirming waits for the database lookup of the current name, so a line is never confirmed by accident unmatched.
  const searching = query.trim().length >= 2 && searchedFor !== query.trim();
  const set = (patch: Partial<RxLine>) => onChange((l) => ({ ...l, ...patch, confirmed: false }));
  const field = (key: 'medicine' | 'strength' | 'frequency' | 'duration') => (
    <label className="block">
      <span className="text-sm text-slate-700">{t(key)}</span>
      <input
        value={line[key]}
        data-testid={`line-${key}`}
        onChange={(e) => {
          set({ [key]: e.target.value, ...(key === 'medicine' ? { product: null } : {}) });
          if (key === 'medicine') setQuery(e.target.value);
        }}
        className="min-h-11 w-full rounded-lg border-2 border-slate-300 px-2"
      />
    </label>
  );

  if (line.confirmed) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-xl border-2 border-green-700 bg-green-50 p-3" data-testid="rx-line" data-confirmed="true">
        <span className="min-w-0">
          <span className="block font-semibold">
            <Icon name="check" size={16} className="mr-1 align-[-3px] text-green-800" />
            {line.product ? `${line.product.brand} ${line.product.strength}` : line.medicine} · {[line.frequency, line.duration].filter(Boolean).join(' · ')}
          </span>
          <span className="block text-sm text-slate-700">{line.product?.generic ?? t('noMatch')}</span>
        </span>
        <button type="button" onClick={() => onChange((l) => ({ ...l, confirmed: false }))} className="min-h-11 shrink-0 rounded-lg border-2 border-slate-400 px-3 font-semibold">
          {t('edit')}
        </button>
      </li>
    );
  }

  return (
    <li className={`space-y-2 rounded-xl border-2 p-3 ${lowConfidence ? 'border-amber-500 bg-amber-50' : 'border-slate-300 bg-white'}`} data-testid="rx-line" data-confirmed="false">
      {line.confidence !== null && (
        <p className={`text-sm ${lowConfidence ? 'font-semibold text-amber-900' : 'text-slate-700'}`}>
          {t('confidence', { value: Math.round(line.confidence * 100) })}
          {lowConfidence && ` — ${t('unclear')}`}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">{field('medicine')}</div>
        {field('strength')}
        {field('frequency')}
        <div className="col-span-2">{field('duration')}</div>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-sm font-semibold">{t('match')}</legend>
        {shown === null ? null : shown.length === 0 ? (
          <p className="text-sm text-amber-900">{t('noMatch')}</p>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {shown.map((p) => (
              <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-slate-50">
                <input
                  type="radio"
                  name={`match-${line.id}`}
                  checked={line.product?.id === p.id}
                  onChange={() => onChange((l) => ({ ...l, product: p, confirmed: false }))}
                  className="size-5 accent-teal-800"
                />
                <span className="text-sm">
                  <strong>
                    {p.brand} {p.strength}
                  </strong>{' '}
                  · {p.form} · {p.generic}
                </span>
              </label>
            ))}
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-slate-50">
              <input
                type="radio"
                name={`match-${line.id}`}
                checked={!line.product}
                onChange={() => onChange((l) => ({ ...l, product: null, confirmed: false }))}
                className="size-5 accent-teal-800"
              />
              <span className="text-sm">{t('noMatch')}</span>
            </label>
          </div>
        )}
      </fieldset>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!line.medicine.trim() || searching}
          onClick={() => onChange((l) => ({ ...l, confirmed: true }))}
          data-testid="confirm-line"
          className="min-h-12 flex-1 rounded-xl bg-teal-800 px-3 font-bold text-white disabled:opacity-50"
        >
          {t('confirm')}
        </button>
        <button type="button" onClick={onRemove} className="min-h-12 rounded-xl border-2 border-slate-400 px-3 font-semibold">
          {t('remove')}
        </button>
      </div>
    </li>
  );
}
