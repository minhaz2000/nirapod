'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import Notice from '@/components/Notice';
import { GLUCOSE_TARGETS } from '@/config/glucose-targets';
import { formatGlucose, isLowGlucose, toMmol, type GlucoseUnit } from '@/lib/rules/glucose';
import type { GlucoseKind, GlucoseReading } from '@/lib/store/db';
import { addGlucose, GLUCOSE_KINDS, glucoseSince } from '@/lib/store/diabetes';
import LowGlucoseAlert from './LowGlucoseAlert';

interface Props {
  personId: string;
  unit: GlucoseUnit;
  /** Set when the user taps "Enter it now" for a meal's 2-hour reading. */
  forMeal: { id: number; takenAt: number } | null;
  refresh: number;
  onSaved: () => void;
}

/** Enter a reading; any value below 3.9 mmol/L shows emergency guidance first (rule 6). */
export default function GlucosePanel({ personId, unit, forMeal, refresh, onSaved }: Props) {
  const t = useTranslations('diabetes.glucose');
  const ts = useTranslations('settings');
  const format = useFormatter();
  const [value, setValue] = useState('');
  const [kind, setKind] = useState<GlucoseKind>(forMeal ? 'twoHour' : 'fasting');
  const [error, setError] = useState(false);
  const [low, setLow] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [recent, setRecent] = useState<GlucoseReading[]>([]);

  useEffect(() => {
    let alive = true;
    glucoseSince(personId, Date.now() - 30 * 86_400_000).then((r) => alive && setRecent(r.sort((a, b) => b.takenAt - a.takenAt).slice(0, 10)));
    return () => {
      alive = false;
    };
  }, [personId, refresh]);

  const [prevMeal, setPrevMeal] = useState(forMeal);
  if (forMeal !== prevMeal) {
    setPrevMeal(forMeal);
    if (forMeal) setKind('twoHour');
  }

  async function save() {
    const n = Number(value.replace(',', '.'));
    const mmol = Number.isFinite(n) ? toMmol(n, unit) : NaN;
    const { mmolMin, mmolMax } = GLUCOSE_TARGETS.plausible;
    if (!(mmol >= mmolMin && mmol <= mmolMax)) {
      setError(true);
      return;
    }
    setError(false);
    await addGlucose({ personId, takenAt: Date.now(), mmol, kind, ...(kind === 'twoHour' && forMeal ? { mealId: forMeal.id } : {}) });
    setLow(isLowGlucose(mmol) ? mmol : null);
    setSaved(true);
    setValue('');
    onSaved();
  }

  const high = GLUCOSE_TARGETS.twoHour.target;
  return (
    <section className="space-y-4" data-testid="glucose-panel">
      {low !== null && <LowGlucoseAlert mmol={low} />}
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-xl font-bold">{t('add')}</h2>
        {forMeal && kind === 'twoHour' && (
          <p className="text-sm text-slate-700">{t('due', { time: format.dateTime(new Date(forMeal.takenAt), { hour: 'numeric', minute: '2-digit' }) })}</p>
        )}
        <label className="block">
          <span className="font-semibold">{t('value', { unit: ts(unit) })}</span>
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            data-testid="glucose-value"
            className="min-h-14 w-full rounded-xl border-2 border-slate-400 px-3 text-2xl"
          />
        </label>
        <fieldset>
          <legend className="font-semibold">{t('kind')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {GLUCOSE_KINDS.map((k) => (
              <label key={k} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-slate-300 px-2 has-[:checked]:border-teal-800 has-[:checked]:bg-teal-50">
                <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} className="size-5 accent-teal-800" />
                <span className="text-sm">{t(`kinds.${k}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <Notice tone="warning">{t('invalid')}</Notice>}
        <button type="button" onClick={save} data-testid="glucose-save" className="min-h-14 w-full rounded-2xl bg-teal-800 px-4 text-lg font-bold text-white">
          {t('save')}
        </button>
        {saved && (
          <p role="status" className="text-green-800">
            {t('saved')}
          </p>
        )}
      </div>

      <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="font-bold">{t('recent')}</h3>
        {recent.length === 0 ? (
          <p className="text-slate-700">{t('none')}</p>
        ) : (
          <ul className="divide-y divide-slate-200" data-testid="glucose-recent">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm text-slate-700">
                  {format.dateTime(new Date(r.takenAt), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {t(`kinds.${r.kind}`)}
                </span>
                <span className="flex items-center gap-2 font-bold">
                  {formatGlucose(r.mmol, unit)} {ts(unit)}
                  {isLowGlucose(r.mmol) && <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs text-white">{t('low')}</span>}
                  {r.mmol >= high && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs text-black">{t('high')}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
