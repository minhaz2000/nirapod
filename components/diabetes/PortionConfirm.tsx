'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/Icon';
import type { AddedFoodSize, PortionCorrection } from '@/config/portion';
import { colourFor } from '@/lib/ai/food';
import type { FoodClassNutrition } from '@/lib/nutrition/schema';
import { addedFood, correctPortion, mealCarbs, relabelPortion, type FoodPortion } from '@/lib/rules/portion';
import { useFoodName } from './useFoodName';

export interface PendingPortion extends FoodPortion {
  /** Rule 5: false when the model was not sure — the user must say what the food is. */
  named: boolean;
  classIndex: number;
}

interface Props {
  portions: PendingPortion[];
  onChange: (p: PendingPortion[]) => void;
  nutrition: Record<string, FoodClassNutrition>;
  classes: readonly string[];
  plateDiameterCm: number;
  onConfirm: () => void;
}

let n = 0;
const newId = () => `added-${Date.now().toString(36)}-${++n}`;

/** Always shown after a photo: one-tap less / about right / more per food, fix names, remove, add missed foods. */
export default function PortionConfirm({ portions, onChange, nutrition, classes, plateDiameterCm, onConfirm }: Props) {
  const t = useTranslations('diabetes.meal');
  const food = useFoodName();
  const [addClass, setAddClass] = useState('');
  const [addSize, setAddSize] = useState<AddedFoodSize>('medium');
  const unnamed = portions.filter((p) => !p.named).length;
  const total = mealCarbs(portions.filter((p) => p.named));

  const update = (id: string, f: (p: PendingPortion) => PendingPortion) => onChange(portions.map((p) => (p.id === id ? f(p) : p)));

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm" data-testid="portion-confirm">
      <h3 className="text-lg font-bold">{t('confirmTitle')}</h3>
      <p className="text-sm text-slate-700">{t('confirmHint')}</p>
      {portions.length === 0 && <p className="text-slate-700">{t('empty')}</p>}
      <ul className="space-y-3">
        {portions.map((p) => (
          <li key={p.id} className="space-y-2 rounded-xl border-2 border-slate-200 p-3" data-testid="portion" data-food={p.named ? p.modelClass : ''}>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="size-4 shrink-0 rounded-full" style={{ background: colourFor(p.classIndex) }} />
              {p.named ? (
                <span className="font-bold">{food(p.modelClass)}</span>
              ) : (
                <label className="flex-1">
                  <span className="block text-sm font-semibold text-amber-900">{t('notSure')}</span>
                  <select
                    value=""
                    data-testid="portion-choose"
                    onChange={(e) => {
                      const cls = e.target.value;
                      if (!cls || !nutrition[cls]) return;
                      update(p.id, (x) => ({ ...relabelPortion(x, cls, nutrition[cls]!), named: true, classIndex: classes.indexOf(cls), source: x.source }));
                    }}
                    className="min-h-11 w-full rounded-lg border-2 border-amber-500 px-2"
                  >
                    <option value="">{t('choose')}</option>
                    {classes.map((c) => (
                      <option key={c} value={c}>
                        {food(c)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {p.confidence !== null && <span className="ml-auto text-xs text-slate-600">{t('confidence', { value: Math.round(p.confidence * 100) })}</span>}
            </div>
            {p.named && (
              <>
                <p className="text-sm text-slate-800">{t('amount', { grams: p.grams, carbs: Math.round(p.carbs) })}</p>
                <div className="grid grid-cols-3 gap-1" role="group" aria-label={food(p.modelClass)}>
                  {(['less', 'right', 'more'] as PortionCorrection[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={p.correction === c}
                      data-testid={`portion-${c}`}
                      onClick={() => update(p.id, (x) => ({ ...correctPortion(x, c, nutrition[x.modelClass]!), named: true, classIndex: x.classIndex }))}
                      className={`min-h-11 rounded-lg border-2 text-sm font-semibold ${p.correction === c ? 'border-teal-800 bg-teal-800 text-white' : 'border-slate-300 bg-white'}`}
                    >
                      {t(c)}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button type="button" onClick={() => onChange(portions.filter((x) => x.id !== p.id))} className="inline-flex min-h-11 items-center gap-1 text-sm text-slate-700 underline">
              <Icon name="trash" size={16} />
              {t('remove')}
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-2 rounded-xl border-2 border-dashed border-teal-700 p-3" data-testid="add-missed">
        <p className="font-semibold">{t('addMissed')}</p>
        <select value={addClass} onChange={(e) => setAddClass(e.target.value)} aria-label={t('food')} data-testid="add-food-class" className="min-h-11 w-full rounded-lg border-2 border-slate-300 px-2">
          <option value="">{t('choose')}</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {food(c)}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-3 gap-1">
          {(['small', 'medium', 'large'] as AddedFoodSize[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={addSize === s}
              onClick={() => setAddSize(s)}
              className={`min-h-11 rounded-lg border-2 text-sm font-semibold ${addSize === s ? 'border-teal-800 bg-teal-50' : 'border-slate-300'}`}
            >
              {t(s)}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!addClass || !nutrition[addClass]}
          data-testid="add-food"
          onClick={() => {
            onChange([...portions, { ...addedFood(newId(), addClass, addSize, plateDiameterCm, nutrition[addClass]!), named: true, classIndex: classes.indexOf(addClass) }]);
            setAddClass('');
          }}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg bg-teal-800 font-bold text-white disabled:opacity-50"
        >
          <Icon name="plus" size={18} />
          {t('add')}
        </button>
      </div>

      <p className="text-lg font-bold" data-testid="portion-total">
        {t('total', { carbs: total })}
      </p>
      <button
        type="button"
        disabled={unnamed > 0 || portions.length === 0}
        onClick={onConfirm}
        data-testid="meal-confirm"
        className="min-h-14 w-full rounded-2xl bg-teal-800 px-4 text-lg font-bold text-white disabled:opacity-50"
      >
        {t('confirm')}
      </button>
    </section>
  );
}
