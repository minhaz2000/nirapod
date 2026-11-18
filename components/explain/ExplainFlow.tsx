'use client';

import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import Notice from '@/components/Notice';
import type { HealthProfile } from '@/lib/rules/prescription';
import type { CheckedValue } from '@/lib/rules/report-ranges';
import { EMPTY_PROFILE, getHealthProfile } from '@/lib/store/profile';
import { getSettings } from '@/lib/store/settings';
import ExplainResults from './ExplainResults';
import PrescriptionStep from './PrescriptionStep';
import ReportStep from './ReportStep';
import type { RxLine } from './types';

/** Report + prescription → checks → explanation. Works fully without an API key. */
export default function ExplainFlow() {
  const t = useTranslations('medicine.explain');
  const [ai, setAi] = useState<boolean | null>(null);
  const [demo, setDemo] = useState(false);
  const [profile, setProfile] = useState<HealthProfile>(EMPTY_PROFILE);
  const [values, setValues] = useState<CheckedValue[]>([]);
  const [lines, setLines] = useState<RxLine[]>([]);
  const [diagnosis, setDiagnosis] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    fetch('/api/handwriting')
      .then((r) => r.json())
      .then((j: { available: boolean }) => setAi(j.available))
      .catch(() => setAi(false));
    getSettings()
      .then((s) => setDemo(s.demoMode))
      .catch(() => undefined);
    getHealthProfile()
      .then(setProfile)
      .catch(() => undefined);
  }, []);

  const setLinesAndReset = useCallback((update: SetStateAction<RxLine[]>) => {
    setLines(update);
    setShow(false);
  }, []);

  const pending = lines.filter((l) => !l.confirmed).length;
  const confirmed = lines.length - pending;
  const canCheck = pending === 0 && (values.length > 0 || confirmed > 0);

  // Any change to the inputs hides old results until "Check" is pressed again.
  const update =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setShow(false);
    };

  return (
    <section className="space-y-4" aria-labelledby="explain-title" data-testid="explain-flow" data-ai={ai === null ? 'unknown' : String(ai)}>
      <h2 id="explain-title" className="text-xl font-bold">
        {t('title')}
      </h2>
      <p>{t('intro')}</p>
      {ai !== null && (
        <div data-testid={ai ? 'ai-on' : 'ai-off'}>
          <Notice tone={ai ? 'info' : 'warning'}>{ai ? t('aiOn') : t('aiOff')}</Notice>
        </div>
      )}

      <ReportStep values={values} onChange={update(setValues)} demo={demo} />
      <PrescriptionStep ai={ai} demo={demo} lines={lines} setLines={setLinesAndReset} diagnosis={diagnosis} onDiagnosis={update(setDiagnosis)} />

      <button
        type="button"
        disabled={!canCheck}
        onClick={() => setShow(true)}
        data-testid="explain-check"
        className="min-h-14 w-full rounded-2xl bg-teal-800 px-4 text-lg font-bold text-white disabled:opacity-50"
      >
        {t('results.check')}
      </button>

      {show && <ExplainResults values={values} lines={lines} diagnosis={diagnosis} profile={profile} />}

      {(values.length > 0 || lines.length > 0) && (
        <button
          type="button"
          onClick={() => {
            setValues([]);
            setLines([]);
            setDiagnosis('');
            setShow(false);
          }}
          className="min-h-12 w-full rounded-xl border-2 border-slate-400 px-4 font-semibold"
        >
          {t('results.startOver')}
        </button>
      )}
    </section>
  );
}
