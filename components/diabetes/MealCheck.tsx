'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import CameraCapture from '@/components/CameraCapture';
import { loadPhoto } from '@/lib/image/photo';
import ModelStatus from '@/components/ModelStatus';
import Notice from '@/components/Notice';
import { LEARNING } from '@/config/meal-signal';
import { analysePlate, drawDetections, type PlateAnalysis } from '@/lib/ai/food';
import type { ModelMeta } from '@/lib/ai/session';
import { getNutritionTable } from '@/lib/nutrition/client';
import type { FoodClassNutrition } from '@/lib/nutrition/schema';
import { baseSignal, controlLevel, personalSignal, suggestion } from '@/lib/rules/meal-signal';
import { mainCarbFood, mealCarbs, portionFromDetection } from '@/lib/rules/portion';
import type { DiabetesProfile, Meal } from '@/lib/store/db';
import { addMeal, patternsFor } from '@/lib/store/diabetes';
import PortionConfirm, { type PendingPortion } from './PortionConfirm';
import SignalCard from './SignalCard';
import { useFoodName } from './useFoodName';

interface Props {
  personId: string;
  profile: DiabetesProfile;
  demo: boolean;
  onSaved: () => void;
}

export const DEMO_PLATES = ['/samples/plate-1.jpg', '/samples/plate-2.jpg'] as const;

type Step = { k: 'idle' } | { k: 'analysing' } | { k: 'confirm' } | { k: 'result'; meal: Meal; dueAt: number };

/** Photo → on-device recognition → portion confirmation (always) → green / amber / red. */
export default function MealCheck({ personId, profile, demo, onSaved }: Props) {
  const t = useTranslations('diabetes.meal');
  const food = useFoodName();
  const [model, setModel] = useState<{ meta: ModelMeta; session: unknown } | null>(null);
  const [nutrition, setNutrition] = useState<Record<string, FoodClassNutrition> | null>(null);
  const [step, setStep] = useState<Step>({ k: 'idle' });
  const [portions, setPortions] = useState<PendingPortion[]>([]);
  const [analysis, setAnalysis] = useState<PlateAnalysis | null>(null);
  const [noFood, setNoFood] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);

  const [plates, setPlates] = useState<string[]>([]);
  useEffect(() => {
    getNutritionTable()
      .then(setNutrition)
      .catch(() => setNutrition(null));
  }, []);

  // Demo plates are shown only if the sample photos are present in public/samples/.
  useEffect(() => {
    if (!demo) return;
    let alive = true;
    Promise.all(
      DEMO_PLATES.map((src): Promise<string | null> =>
        fetch(src, { method: 'HEAD' })
          .then((r) => (r.ok ? src : null))
          .catch(() => null),
      ),
    ).then((found) => {
      if (alive) setPlates(found.filter((x): x is string => x !== null));
    });
    return () => {
      alive = false;
    };
  }, [demo]);

  const classes = model?.meta.classes ?? (nutrition ? Object.keys(nutrition).sort() : []);

  // Draw the coloured masks once the canvas is on screen.
  useEffect(() => {
    if (analysis && bitmapRef.current && canvasRef.current) {
      drawDetections(canvasRef.current, bitmapRef.current, analysis, (d) => (d.confident ? food(d.label) : t('notSure')));
    }
  }, [analysis, food, t]);

  async function analyse(blob: Blob) {
    setNoFood(false);
    if (!model || !nutrition) {
      setPortions([]);
      setAnalysis(null);
      return setStep({ k: 'confirm' });
    }
    // Decode first (upright, longest side ≤ 1600 px): a file the browser cannot open throws PhotoError here, while
    // the photo buttons are still on screen to show the JPG / PNG message.
    const { bitmap } = await loadPhoto(blob);
    setStep({ k: 'analysing' });
    try {
      bitmapRef.current = bitmap;
      const result = await analysePlate(bitmap, model.session, model.meta);
      setAnalysis(result);
      setPortions(
        result.detections
          .filter((d) => nutrition[d.label])
          .map((d, i) => ({
            ...portionFromDetection(`det-${i}`, d, { width: result.width, height: result.height }, profile.plateDiameterCm, nutrition[d.label]!),
            named: d.confident, // rule 5: below min_confidence the user names the food
            classIndex: d.classIndex,
          })),
      );
      setNoFood(result.detections.length === 0);
    } catch {
      setAnalysis(null);
      setPortions([]);
      setNoFood(true);
    }
    setStep({ k: 'confirm' });
  }

  async function confirm() {
    const named = portions.filter((p) => p.named);
    const carbs = mealCarbs(named);
    const level = controlLevel({ fastingMmol: profile.fastingMmol, hba1c: profile.hba1c });
    const base = baseSignal(carbs, level);
    const main = mainCarbFood(named);
    const patterns = await patternsFor(personId, profile.fastingMmol);
    const personal = personalSignal(base, patterns.find((p) => p.food === main));
    const meal: Meal = {
      personId,
      takenAt: Date.now(),
      foods: named.map((p) => ({ modelClass: p.modelClass, grams: p.grams, carbs: p.carbs, source: p.source, confidence: p.confidence, correction: p.correction })),
      carbs,
      signal: personal.signal,
      baseSignal: base,
      adjusted: personal.adjusted,
      mainFood: main,
      suggestion: suggestion(personal.signal, main),
    };
    meal.id = await addMeal(meal);
    setStep({ k: 'result', meal, dueAt: meal.takenAt + LEARNING.twoHourMinutes * 60_000 });
    onSaved();
  }

  function reset() {
    setStep({ k: 'idle' });
    setPortions([]);
    setAnalysis(null);
    setNoFood(false);
  }

  return (
    <section className="space-y-4" data-testid="meal-check" data-step={step.k}>
      <ModelStatus name="food_seg" onReady={(meta, session) => setModel({ meta, session })} />

      {step.k === 'idle' && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold">{t('title')}</h2>
          <p>{t('hint')}</p>
          <CameraCapture label={t('takePhoto')} onCapture={analyse} livePreview />
          {!model && <p className="text-sm text-slate-700">{t('noModel')}</p>}
          <p className="text-sm text-slate-700">{t('privacy')}</p>
          {demo && plates.length > 0 && (
            <div className="space-y-2 rounded-2xl border-2 border-dashed border-teal-700 p-3" data-testid="demo-plates">
              <p className="font-semibold">{t('samples')}</p>
              <div className="flex gap-2">
                {plates.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    data-testid={`demo-plate-${i + 1}`}
                    onClick={async () => analyse(await (await fetch(src)).blob())}
                    className="min-h-11 flex-1 rounded-xl border-2 border-teal-800 px-3 font-semibold text-teal-900"
                  >
                    {t('sample', { n: i + 1 })}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" onClick={() => setStep({ k: 'confirm' })} data-testid="meal-manual" className="min-h-12 w-full rounded-xl border-2 border-slate-400 px-4 font-semibold">
            {t('addMissed')}
          </button>
        </div>
      )}

      {step.k === 'analysing' && (
        <p role="status" className="rounded-2xl bg-white p-4 shadow-sm">
          {t('analysing')}
        </p>
      )}

      {(step.k === 'confirm' || step.k === 'result') && analysis && (
        <canvas
          ref={canvasRef}
          data-testid="meal-canvas"
          className="w-full rounded-2xl shadow-sm"
          aria-label={portions.map((p) => (p.named ? food(p.modelClass) : t('notSure'))).join(', ')}
          // Machine-readable result for tests and demos: label, score, share of the photo, box in photo pixels.
          data-analysis={JSON.stringify({
            ms: analysis.ms,
            srcW: analysis.srcW,
            srcH: analysis.srcH,
            detections: analysis.detections.map((d) => ({ label: d.label, score: Math.round(d.score * 1000) / 1000, area: Math.round(d.areaFraction * 10_000) / 10_000, box: d.box.map(Math.round) })),
          })}
        />
      )}

      {step.k === 'confirm' && (
        <>
          {noFood && <Notice tone="warning">{t('noFood')}</Notice>}
          {nutrition && (
            <PortionConfirm
              portions={portions}
              onChange={setPortions}
              nutrition={nutrition}
              classes={classes}
              plateDiameterCm={profile.plateDiameterCm}
              onConfirm={confirm}
            />
          )}
        </>
      )}

      {step.k === 'result' && <SignalCard meal={step.meal} dueAt={step.dueAt} onAgain={reset} />}
    </section>
  );
}
