'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Notice from '@/components/Notice';
import { emergencyHref } from '@/lib/emergency/navigate';
import type { ExplainInput } from '@/lib/explain/input';
import { findingText, relationText, type ExplainT } from '@/lib/explain/template';
import { redact } from '@/lib/privacy/redact';
import { checkPrescription, relateReportToPrescription, type ConfirmedMedicine, type HealthProfile } from '@/lib/rules/prescription';
import type { CheckedValue } from '@/lib/rules/report-ranges';
import { rangeText } from './ReportStep';
import type { RxLine } from './types';

interface Props {
  values: CheckedValue[];
  lines: RxLine[];
  diagnosis: string;
  profile: HealthProfile;
}

type Explanation = { k: 'loading' } | { k: 'done'; text: string; source: 'ai' | 'template'; reason?: string } | { k: 'error' };
type KeyedExplanation = Exclude<Explanation, { k: 'loading' }> & { key: string };

export function toConfirmed(lines: readonly RxLine[]): ConfirmedMedicine[] {
  return lines
    .filter((l) => l.confirmed)
    .map((l) => ({
      lineId: l.id,
      brand: l.product?.brand ?? l.medicine.trim(),
      generic: l.product?.generic ?? null,
      strength: l.product?.strength || l.strength,
      form: l.product?.form ?? '',
      frequency: l.frequency,
      duration: l.duration,
      pregnancyCategory: l.product?.pregnancyCategory ?? null,
    }));
}

/** Rules → findings → relations → explanation. Only confirmed lines are used (rule 7). */
export default function ExplainResults({ values, lines, diagnosis, profile }: Props) {
  const t = useTranslations('medicine.explain');
  const tt = t as unknown as ExplainT;
  const locale = useLocale() as ExplainInput['locale'];
  const meds = useMemo(() => toConfirmed(lines), [lines]);
  const findings = useMemo(() => checkPrescription(meds, profile), [meds, profile]);
  const relations = useMemo(() => (values.length && meds.length ? relateReportToPrescription(values, meds) : []), [values, meds]);
  const lowGlucose = values.find((v) => v.lowGlucoseEmergency);

  const body = useMemo<ExplainInput>(
    () => ({
      locale,
      doctorDiagnosis: diagnosis.trim() ? redact(diagnosis.trim()) : null,
      lowGlucoseEmergency: Boolean(lowGlucose),
      values: values.map((v) => ({ test: v.name, value: v.value, unit: v.unit, status: v.status, range: rangeText(v), rangeSource: v.rangeSource })),
      medicines: meds.map((m) => ({ brand: m.brand, generic: m.generic, strength: m.strength, form: m.form, frequency: m.frequency, duration: m.duration })),
      findings,
      relations,
    }),
    [locale, diagnosis, lowGlucose, values, meds, findings, relations],
  );

  // The explanation belongs to one exact input; a newer input shows "writing…" until its own reply arrives.
  const requestKey = useMemo(() => JSON.stringify(body), [body]);
  const [result, setResult] = useState<KeyedExplanation | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestKey })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { text: string; source: 'ai' | 'template'; reason?: string }) => alive && setResult({ k: 'done', ...j, key: requestKey }))
      .catch(() => alive && setResult({ k: 'error', key: requestKey }));
    return () => {
      alive = false;
    };
  }, [requestKey]);
  const explanation: Explanation = result && result.key === requestKey ? result : { k: 'loading' };

  const card = 'space-y-2 rounded-2xl bg-white p-4 shadow-sm';
  return (
    <section className="space-y-4" data-testid="explain-results">
      <h3 className="text-lg font-bold">{t('results.title')}</h3>

      {lowGlucose && (
        <div data-testid="results-low-glucose" className="space-y-2">
          <Notice tone="danger">{t('report.lowGlucose')}</Notice>
          <Link href={emergencyHref({ selected: ['lowGlucose'] })} className="inline-flex min-h-11 items-center rounded-xl bg-red-700 px-4 font-bold text-white">
            ☎ 999
          </Link>
        </div>
      )}

      {diagnosis.trim() && (
        <div className={`${card} border-l-8 border-teal-800`} data-testid="results-diagnosis">
          <h4 className="font-bold">{t('results.diagnosisTitle')}</h4>
          <p className="text-lg">{diagnosis.trim()}</p>
          <p className="text-sm text-slate-700">{t('results.diagnosisNote')}</p>
        </div>
      )}

      {meds.length > 0 && (
        <div className={card} data-testid="results-findings">
          <h4 className="font-bold">{t('results.findingsTitle')}</h4>
          {findings.length === 0 ? (
            <p className="text-green-800">{t('results.noFindings')}</p>
          ) : (
            <ul className="space-y-2">
              {findings.map((f, i) => (
                <li key={i} data-finding={f.code} className="rounded-lg bg-amber-50 p-2">
                  {f.code === 'interaction' && (
                    <span className={`mr-2 rounded px-2 py-0.5 text-xs font-bold ${f.severity === 'avoid' ? 'bg-red-700 text-white' : 'bg-amber-300 text-black'}`}>
                      {t(`severity.${f.severity}`)}
                    </span>
                  )}
                  {findingText(tt, f)}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-600">{t('results.checksNote')}</p>
          <p className="text-xs text-slate-600">{t('results.profileNote')}</p>
        </div>
      )}

      {relations.length > 0 && (
        <div className={card} data-testid="results-relations">
          <h4 className="font-bold">{t('results.relationsTitle')}</h4>
          <ul className="list-disc space-y-1 pl-5">
            {relations.map((r, i) => (
              <li key={i} data-relation={r.kind} className={r.kind === 'related' ? '' : 'font-semibold text-amber-900'}>
                {relationText(tt, r)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={card} data-testid="results-explanation" data-source={explanation.k === 'done' ? explanation.source : explanation.k}>
        <h4 className="font-bold">{t('results.explanationTitle')}</h4>
        {explanation.k === 'loading' && <p role="status">{t('results.writing')}</p>}
        {explanation.k === 'error' && <p>{t('results.disclaimer')}</p>}
        {explanation.k === 'done' && (
          <>
            <div className="space-y-1 whitespace-pre-line" data-testid="explanation-text">
              {explanation.text}
            </div>
            <p className="text-xs text-slate-600" data-testid="explanation-source">
              {explanation.source === 'ai'
                ? t('results.sourceAi')
                : explanation.reason?.startsWith('validation_failed')
                  ? t('results.sourceFallback')
                  : t('results.sourceTemplate')}
            </p>
          </>
        )}
      </div>

      <Notice tone="warning">{t('results.disclaimer')}</Notice>
    </section>
  );
}
