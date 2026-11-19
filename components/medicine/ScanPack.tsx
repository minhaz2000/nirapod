'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import CameraCapture from '@/components/CameraCapture';
import Notice from '@/components/Notice';
import type { QualityIssue } from '@/lib/ai/quality';
import {
  fetchAlternatives,
  MedicineApiFailure,
  searchCandidates,
  searchMedicines,
  type AlternativesResponse,
  type MedicineApiError,
} from '@/lib/medicine/client';
import { preselectProduct } from '@/lib/medicine/pick';
import type { BrandMatch, Product } from '@/lib/medicine/repo';
import { readPack, type PackReading } from '@/lib/ocr/pack';
import { getSettings } from '@/lib/store/settings';
import PackResults from './PackResults';
import ProductPicker from './ProductPicker';

type Step =
  | { k: 'idle' }
  | { k: 'checking' }
  | { k: 'quality'; bitmap: ImageBitmap; issues: QualityIssue[] }
  | { k: 'reading'; percent: number }
  | { k: 'looking' }
  | { k: 'confirm'; reading: PackReading | null; matches: BrandMatch[]; noMatchFor?: string }
  | { k: 'result'; reading: PackReading | null; product: Product; alternatives: AlternativesResponse }
  | { k: 'error'; error: MedicineApiError | 'ocr' };

const SAMPLES = { demoOk: '/samples/medicine-pack-ok.png', demoCheck: '/samples/medicine-pack-check.png' } as const;

/** Photo → quality check → on-device OCR → user confirms brand → results. */
export default function ScanPack() {
  const t = useTranslations('medicine.scan');
  const [step, setStep] = useState<Step>({ k: 'idle' });
  const [demo, setDemo] = useState(false);
  const [query, setQuery] = useState('');
  const [reading, setReading] = useState<PackReading | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => setDemo(s.demoMode))
      .catch(() => undefined);
  }, []);

  const fail = (err: unknown) =>
    setStep({ k: 'error', error: err instanceof MedicineApiFailure ? err.kind : 'generic' });

  async function startFromBlob(blob: Blob) {
    // A photo the browser cannot open throws PhotoError before the step changes, so CameraCapture (still on screen)
    // can show the JPG / PNG message.
    const { decodeImage, checkQuality } = await import('@/lib/ocr/canvas');
    const bitmap = await decodeImage(blob);
    setStep({ k: 'checking' });
    try {
      const report = checkQuality(bitmap);
      if (!report.ok) return setStep({ k: 'quality', bitmap, issues: report.issues });
      await read(bitmap);
    } catch {
      setStep({ k: 'error', error: 'ocr' });
    }
  }

  async function read(bitmap: ImageBitmap) {
    let packReading: PackReading;
    try {
      setStep({ k: 'reading', percent: 0 });
      const [{ prepareForOcr }, { recognisePrinted }] = await Promise.all([
        import('@/lib/ocr/canvas'),
        import('@/lib/ocr/tesseract'),
      ]);
      const { canvas } = prepareForOcr(bitmap);
      const ocr = await recognisePrinted(canvas, (p) => setStep({ k: 'reading', percent: Math.round(p * 100) }));
      packReading = readPack(ocr.text, ocr.words);
      setReading(packReading);
    } catch {
      return setStep({ k: 'error', error: 'ocr' });
    }
    try {
      setStep({ k: 'looking' });
      const matches = packReading.brandCandidates.length ? await searchCandidates(packReading.brandCandidates) : [];
      setStep({ k: 'confirm', reading: packReading, matches });
    } catch (err) {
      fail(err);
    }
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    try {
      setStep({ k: 'looking' });
      const { results } = await searchMedicines(q);
      setStep({ k: 'confirm', reading, matches: results, noMatchFor: results.length ? undefined : q });
    } catch (err) {
      fail(err);
    }
  }

  async function onConfirm(product: Product) {
    try {
      setStep({ k: 'looking' });
      const alternatives = await fetchAlternatives(product.id);
      setStep({ k: 'result', reading, product, alternatives });
    } catch (err) {
      fail(err);
    }
  }

  function restart() {
    setReading(null);
    setQuery('');
    setStep({ k: 'idle' });
  }

  const searchForm = (label: string) => (
    <form onSubmit={onSearch} className="space-y-2" role="search">
      <label htmlFor="brand-search" className="block font-semibold">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id="brand-search"
          data-testid="brand-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-400 px-3 text-lg"
        />
        <button type="submit" className="min-h-12 rounded-xl bg-teal-800 px-4 font-bold text-white">
          {t('search')}
        </button>
      </div>
    </form>
  );

  const busy = (text: string, percent?: number) => (
    <div role="status" className="space-y-2 rounded-2xl bg-white p-4 shadow-sm" data-testid="scan-busy">
      <p className="font-semibold">{text}</p>
      {percent !== undefined && (
        <div className="h-3 rounded-full bg-slate-200">
          <div className="h-3 rounded-full bg-teal-700 transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );

  return (
    <section className="space-y-4" aria-labelledby="scan-title" data-testid="scan-pack" data-step={step.k}>
      <h2 id="scan-title" className="text-xl font-bold">
        {t('title')}
      </h2>

      {step.k === 'idle' && (
        <div className="space-y-4">
          <p>{t('hint')}</p>
          <CameraCapture label={t('takePhoto')} onCapture={startFromBlob} />
          <p className="text-sm text-slate-700">{t('privacy')}</p>
          {demo && (
            <div className="space-y-2 rounded-2xl border-2 border-dashed border-teal-700 p-3" data-testid="demo-samples">
              <p className="font-semibold">{t('demoTitle')}</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SAMPLES) as Array<keyof typeof SAMPLES>).map((key) => (
                  <button
                    key={key}
                    type="button"
                    data-testid={`sample-${key}`}
                    onClick={async () => startFromBlob(await (await fetch(SAMPLES[key])).blob())}
                    className="min-h-11 rounded-xl border-2 border-teal-800 px-3 font-semibold text-teal-900"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {searchForm(t('orType'))}
        </div>
      )}

      {step.k === 'checking' && busy(t('steps.checking'))}
      {step.k === 'reading' && busy(t('steps.reading', { percent: step.percent }), step.percent)}
      {step.k === 'looking' && busy(t('steps.looking'))}

      {step.k === 'quality' && (
        <div className="space-y-3" data-testid="quality-issues">
          <Notice tone="warning">
            <p className="font-semibold">{t('quality.title')}</p>
            <ul className="list-disc pl-5">
              {step.issues.map((i) => (
                <li key={i}>{t(`quality.${i}`)}</li>
              ))}
            </ul>
          </Notice>
          <div className="flex gap-2">
            <button type="button" onClick={restart} className="min-h-12 flex-1 rounded-xl bg-teal-800 px-3 font-bold text-white">
              {t('quality.retake')}
            </button>
            <button
              type="button"
              onClick={() => read(step.bitmap)}
              className="min-h-12 flex-1 rounded-xl border-2 border-teal-800 px-3 font-bold text-teal-900"
            >
              {t('quality.continue')}
            </button>
          </div>
        </div>
      )}

      {step.k === 'confirm' && (
        <div className="space-y-4" data-testid="confirm-step">
          <h3 className="text-lg font-bold">{t('confirm.title')}</h3>
          {step.reading &&
            (step.reading.brandCandidates.length ? (
              <p className="text-slate-800" data-testid="read-as">
                {t('confirm.readAs', { words: step.reading.brandCandidates.slice(0, 3).join(', ') })}
              </p>
            ) : (
              <p>{t('confirm.nothingRead')}</p>
            ))}
          {step.noMatchFor && <Notice tone="warning">{t('confirm.noMatch', { query: step.noMatchFor })}</Notice>}
          {step.matches.length > 0 && (
            <ProductPicker
              key={step.matches.map((m) => m.brand).join('|')}
              matches={step.matches}
              initial={preselectProduct(step.matches, step.reading?.text ?? '')}
              onConfirm={onConfirm}
            />
          )}
          {searchForm(t('confirm.notListed'))}
        </div>
      )}

      {step.k === 'result' && (
        <PackResults product={step.product} reading={step.reading} alternatives={step.alternatives} onRestart={restart} />
      )}

      {step.k === 'error' && (
        <div className="space-y-3" data-testid="scan-error">
          <Notice tone="warning">{t(`errors.${step.error}`)}</Notice>
          <button type="button" onClick={restart} className="min-h-12 w-full rounded-xl bg-teal-800 px-4 font-bold text-white">
            {t('quality.retake')}
          </button>
        </div>
      )}
    </section>
  );
}
