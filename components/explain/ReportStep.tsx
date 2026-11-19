'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import CameraCapture from '@/components/CameraCapture';
import { PhotoError } from '@/lib/image/photo';
import Notice from '@/components/Notice';
import { parseRangeText, parseReport } from '@/lib/ocr/report';
import { checkReport, checkValue, type CheckedValue } from '@/lib/rules/report-ranges';
import Icon from '@/components/Icon';

interface Props {
  values: CheckedValue[];
  onChange: (values: CheckedValue[]) => void;
  demo: boolean;
}

export { rangeText } from '@/lib/rules/report-ranges';
import { rangeText } from '@/lib/rules/report-ranges';

const STATUS_STYLE = {
  high: 'bg-red-100 text-red-900',
  low: 'bg-amber-100 text-amber-900',
  normal: 'bg-green-100 text-green-900',
  unknown: 'bg-slate-100 text-slate-800',
} as const;

/** Printed report → on-device OCR → values with ranges. The photo never leaves the phone. */
export default function ReportStep({ values, onChange, demo }: Props) {
  const t = useTranslations('medicine.explain');
  const [editing, setEditing] = useState<{ index: number; value: string; range: string } | null>(null);
  const [state, setState] = useState<{ k: 'idle' } | { k: 'reading'; percent: number } | { k: 'none' } | { k: 'error' }>({ k: 'idle' });

  async function read(blob: Blob) {
    setState({ k: 'reading', percent: 0 });
    try {
      const [{ decodeImage, prepareForOcr }, { recognisePrinted }] = await Promise.all([import('@/lib/ocr/canvas'), import('@/lib/ocr/tesseract')]);
      const { canvas } = prepareForOcr(await decodeImage(blob));
      const ocr = await recognisePrinted(canvas, (p) => setState({ k: 'reading', percent: Math.round(p * 100) }), 'table');
      const checked = checkReport(parseReport(ocr.text));
      onChange(checked);
      setState(checked.length ? { k: 'idle' } : { k: 'none' });
    } catch (err) {
      if (err instanceof PhotoError) {
        setState({ k: 'idle' });
        throw err; // CameraCapture shows the JPG / PNG message
      }
      setState({ k: 'error' });
    }
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm" data-testid="report-step">
      <h3 className="text-lg font-bold">{t('report.title')}</h3>
      <CameraCapture label={t('report.add')} onCapture={read} />
      {demo && (
        <button
          type="button"
          data-testid="sample-report"
          onClick={async () => read(await (await fetch('/samples/lab-report.png')).blob())}
          className="min-h-11 rounded-xl border-2 border-dashed border-teal-700 px-3 font-semibold text-teal-900"
        >
          {t('demoReport')}
        </button>
      )}
      {state.k === 'reading' && (
        <p role="status" data-testid="report-reading">
          {t('report.reading', { percent: state.percent })}
        </p>
      )}
      {(state.k === 'none' || state.k === 'error') && <Notice tone="warning">{t('report.noneFound')}</Notice>}

      {values.some((v) => v.lowGlucoseEmergency) && (
        <div data-testid="report-low-glucose">
          <Notice tone="danger">{t('report.lowGlucose')}</Notice>
        </div>
      )}

      {values.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold">{t('report.found')}</p>
          <ul className="divide-y divide-slate-200" data-testid="report-values">
            {values.map((v, i) =>
              editing?.index === i ? (
                <li key={`${v.name}-${i}`} className="space-y-2 py-2" data-testid="report-edit">
                  <p className="font-semibold">{v.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm">
                      {t('report.value')} ({v.unit})
                      <input
                        inputMode="decimal"
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        className="min-h-11 w-full rounded-lg border-2 border-slate-300 px-2"
                      />
                    </label>
                    <label className="block text-sm">
                      {t('report.rangeInput')}
                      <input
                        value={editing.range}
                        onChange={(e) => setEditing({ ...editing, range: e.target.value })}
                        className="min-h-11 w-full rounded-lg border-2 border-slate-300 px-2"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const value = Number(editing.value.replace(',', '.'));
                      if (!Number.isFinite(value)) return;
                      const range = parseRangeText(editing.range);
                      onChange(values.map((x, j) => (j === i ? checkValue({ ...x, value, range, rangeNote: null }) : x)));
                      setEditing(null);
                    }}
                    className="min-h-11 rounded-lg bg-teal-800 px-4 font-semibold text-white"
                  >
                    {t('report.save')}
                  </button>
                </li>
              ) : (
                <li key={`${v.name}-${i}`} className="flex items-center justify-between gap-2 py-2" data-status={v.status}>
                  <span className="min-w-0">
                    <span className="block font-semibold">{v.name}</span>
                    <span className="block text-sm text-slate-700">
                      {v.value} {v.unit}
                      {rangeText(v) && ` · ${rangeText(v)}${v.rangeSource === 'fallback' ? ` (${t('report.fallback')})` : ''}`}
                    </span>
                    {v.rangeNote === 'repaired' && v.range && (
                      <span className="block text-xs font-semibold text-amber-900">{t('report.repaired', { range: v.range.text })}</span>
                    )}
                    {v.rangeSuspect && <span className="block text-xs font-semibold text-amber-900">{t('report.suspect')}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className={`rounded-full px-2 py-1 text-sm font-semibold ${STATUS_STYLE[v.status]}`}>{t(`report.${v.status}`)}</span>
                    <button
                      type="button"
                      aria-label={`${t('report.edit')}: ${v.name}`}
                      onClick={() => setEditing({ index: i, value: String(v.value), range: v.range?.text ?? '' })}
                      className="min-h-11 min-w-11 rounded-lg text-lg text-slate-600 hover:bg-slate-100"
                    >
                      <Icon name="pencil" size={20} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${t('report.remove')}: ${v.name}`}
                      onClick={() => onChange(values.filter((_, j) => j !== i))}
                      className="min-h-11 min-w-11 rounded-lg text-xl text-slate-600 hover:bg-slate-100"
                    >
                      <Icon name="close" size={20} />
                    </button>
                  </span>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
