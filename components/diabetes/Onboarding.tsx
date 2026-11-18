'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import CameraCapture from '@/components/CameraCapture';
import Notice from '@/components/Notice';
import { GLUCOSE_TARGETS } from '@/config/glucose-targets';
import { PORTION } from '@/config/portion';
import { isLowGlucose, toMmol, type GlucoseUnit } from '@/lib/rules/glucose';
import { clampPlate } from '@/lib/rules/portion';
import type { DiabetesProfile } from '@/lib/store/db';
import { saveDiabetesProfile } from '@/lib/store/diabetes';
import { updateSettings } from '@/lib/store/settings';
import { loadDemoData } from '@/lib/store/demo';
import LowGlucoseAlert from './LowGlucoseAlert';

interface Props {
  personId: string;
  unit: GlucoseUnit;
  onUnit: (u: GlucoseUnit) => void;
  demo: boolean;
  onDone: (p: DiabetesProfile) => void;
}

const parse = (s: string) => Number(s.replace(',', '.'));

/** One-time setup: prescription photo (proof, kept on the phone), unit, latest fasting sugar, optional HbA1c, plate size. */
export default function Onboarding({ personId, unit, onUnit, demo, onDone }: Props) {
  const t = useTranslations('diabetes.onboarding');
  const ts = useTranslations('settings');
  const [proof, setProof] = useState<Blob | null>(null);
  const [fasting, setFasting] = useState('');
  const [hba1c, setHba1c] = useState('');
  const [plate, setPlate] = useState(String(PORTION.defaultPlateDiameterCm));
  const [error, setError] = useState<string | null>(null);
  const [low, setLow] = useState<{ mmol: number; profile: DiabetesProfile } | null>(null);

  const { plausible } = GLUCOSE_TARGETS;

  async function finish(values: { proof: Blob; fastingMmol: number; hba1c: number | null; plate: number }, stayForLow = false) {
    const profile: DiabetesProfile = {
      id: personId,
      onboardedAt: Date.now(),
      proofPhoto: values.proof,
      fastingMmol: values.fastingMmol,
      fastingAt: Date.now(),
      hba1c: values.hba1c,
      plateDiameterCm: clampPlate(values.plate),
    };
    await saveDiabetesProfile(profile);
    // Rule 6: a low value keeps the emergency guidance on screen until the user moves on.
    if (stayForLow) setLow({ mmol: values.fastingMmol, profile });
    else onDone(profile);
  }

  async function start() {
    setError(null);
    if (!proof) return setError(t('proofNeeded'));
    const f = parse(fasting);
    const mmol = Number.isFinite(f) ? toMmol(f, unit) : NaN;
    if (!(mmol >= plausible.mmolMin && mmol <= plausible.mmolMax)) return setError(t('invalid'));
    const h = hba1c.trim() ? parse(hba1c) : null;
    if (h !== null && !(h >= plausible.hba1cMin && h <= plausible.hba1cMax)) return setError(t('invalid'));
    const p = parse(plate);
    if (!(p > 0)) return setError(t('invalid'));
    await finish({ proof, fastingMmol: mmol, hba1c: h, plate: p }, isLowGlucose(mmol));
  }

  async function startDemo(withData: boolean) {
    const blob = await (await fetch('/samples/prescription.png')).blob();
    if (withData) await loadDemoData(personId);
    await finish({ proof: blob, fastingMmol: 8.4, hba1c: 7.6, plate: 26 });
  }

  const input = 'min-h-12 w-full rounded-xl border-2 border-slate-400 px-3 text-lg';
  return (
    <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm" data-testid="diabetes-onboarding">
      <h2 className="text-xl font-bold">{t('title')}</h2>
      <p>{t('intro')}</p>
      {low && (
        <>
          <LowGlucoseAlert mmol={low.mmol} />
          <button type="button" onClick={() => onDone(low.profile)} data-testid="onboarding-continue" className="min-h-12 w-full rounded-xl border-2 border-teal-800 px-4 font-bold text-teal-900">
            {t('continue')}
          </button>
        </>
      )}

      <div className="space-y-2">
        <p className="font-semibold">{t('proofTitle')}</p>
        <p className="text-sm text-slate-700">{t('proofHint')}</p>
        <CameraCapture label={t('proofTitle')} onCapture={(f) => setProof(f)} />
        {proof && (
          <p className="text-sm text-green-800" data-testid="proof-saved">
            {t('proofSaved')}
          </p>
        )}
      </div>

      <fieldset className="space-y-1">
        <legend className="font-semibold">{t('unit')}</legend>
        <div className="flex gap-2">
          {(['mmol', 'mgdl'] as GlucoseUnit[]).map((u) => (
            <label key={u} className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-300 has-[:checked]:border-teal-800 has-[:checked]:bg-teal-50">
              <input
                type="radio"
                name="unit"
                checked={unit === u}
                onChange={() => {
                  onUnit(u);
                  void updateSettings({ glucoseUnit: u });
                }}
                className="size-5 accent-teal-800"
              />
              {ts(u)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="font-semibold">{t('fasting', { unit: ts(unit) })}</span>
        <input inputMode="decimal" value={fasting} onChange={(e) => setFasting(e.target.value)} data-testid="onboarding-fasting" className={input} />
      </label>
      <label className="block space-y-1">
        <span className="font-semibold">{t('hba1c')}</span>
        <input inputMode="decimal" value={hba1c} onChange={(e) => setHba1c(e.target.value)} data-testid="onboarding-hba1c" className={input} />
      </label>
      <label className="block space-y-1">
        <span className="font-semibold">{t('plate')}</span>
        <input inputMode="decimal" value={plate} onChange={(e) => setPlate(e.target.value)} data-testid="onboarding-plate" className={input} />
        <span className="block text-sm text-slate-700">{t('plateHint')}</span>
      </label>

      {error && (
        <div data-testid="onboarding-error">
          <Notice tone="warning">{error}</Notice>
        </div>
      )}
      <button type="button" onClick={start} data-testid="onboarding-start" className="min-h-14 w-full rounded-2xl bg-teal-800 px-4 text-lg font-bold text-white">
        {t('start')}
      </button>
      {demo && (
        <div className="space-y-2">
          <button type="button" onClick={() => startDemo(false)} data-testid="onboarding-demo" className="min-h-12 w-full rounded-xl border-2 border-dashed border-teal-700 px-4 font-semibold text-teal-900">
            {t('demo')}
          </button>
          <button type="button" onClick={() => startDemo(true)} data-testid="onboarding-demo-data" className="min-h-12 w-full rounded-xl border-2 border-dashed border-teal-700 px-4 font-semibold text-teal-900">
            {t('demoData')}
          </button>
        </div>
      )}
    </section>
  );
}
