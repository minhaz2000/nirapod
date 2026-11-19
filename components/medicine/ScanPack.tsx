'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import CameraCapture from '@/components/CameraCapture';
import Notice from '@/components/Notice';
import type { QualityIssue } from '@/lib/ai/quality';
import {
  MedicineApiFailure,
  fetchAlternatives,
  identifyMedicine,
  readPackWithAi,
  VisionError,
  searchMedicines,
  type AlternativesResponse,
  type IdentifyResponse,
  type MedicineApiError,
} from '@/lib/medicine/client';
import type { ScoredCandidate } from '@/lib/medicine/identify';
import { preselectProduct } from '@/lib/medicine/pick';
import type { BrandMatch, Product } from '@/lib/medicine/repo';
import { evidenceFromReading, isUsefulPackText, mergeReadings, readPack, readingFromVision, type PackReading } from '@/lib/ocr/pack';
import { getSettings } from '@/lib/store/settings';
import ExpiryCard from './ExpiryCard';
import PackResults from './PackResults';
import ProductPicker from './ProductPicker';

type Side = 'front' | 'back';

type Step =
  | { k: 'idle' }
  | { k: 'checking' }
  | { k: 'quality'; bitmap: ImageBitmap; issues: QualityIssue[]; side: Side }
  | { k: 'consent'; bitmap: ImageBitmap; side: Side }
  | { k: 'reading'; percent?: number }
  | { k: 'looking' }
  /** Weak match: the user must choose (top candidates or type the name) before anything else is shown. */
  | { k: 'notSure'; reading: PackReading; candidates: ScoredCandidate[] }
  /** Not in the database: said clearly, and the expiry check is still shown. */
  | { k: 'notFound'; reading: PackReading }
  /** On-phone OCR read almost nothing useful (foil glare, blur): no guesses, tips instead. */
  | { k: 'unreadable'; reading: PackReading }
  /** Typed search results. */
  | { k: 'confirm'; reading: PackReading | null; matches: BrandMatch[]; noMatchFor?: string }
  | { k: 'result'; reading: PackReading | null; product: Product; alternatives: AlternativesResponse; candidates: ScoredCandidate[] }
  | { k: 'error'; error: MedicineApiError | 'ocr' };

const SAMPLES = { demoOk: '/samples/medicine-pack-ok.png', demoCheck: '/samples/medicine-pack-check.png' } as const;

/**
 * Photo → quality check → (consent) vision model, or on-phone OCR → verified against the medicine database →
 * strong match: the medicine; weak: the user chooses; none: "not in the database" with the expiry check.
 * A second photo (back / side of the pack) adds the expiry date when it is printed there.
 */
export default function ScanPack() {
  const t = useTranslations('medicine.scan');
  const [step, setStep] = useState<Step>({ k: 'idle' });
  const [demo, setDemo] = useState(false);
  const [ai, setAi] = useState(false);
  const [consented, setConsented] = useState<boolean | null>(null); // null = not asked in this scan yet
  const [query, setQuery] = useState('');
  const [reading, setReading] = useState<PackReading | null>(null);
  const [notice, setNotice] = useState<'aiFallback' | 'backAdded' | null>(null);
  const [aiReason, setAiReason] = useState<string | null>(null);
  // The result a back / side photo extends (kept while that photo is read).
  const [lastResult, setLastResult] = useState<Extract<Step, { k: 'result' }> | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => setDemo(s.demoMode))
      .catch(() => undefined);
    fetch('/api/pack/read')
      .then((r) => r.json())
      .then((j: { available: boolean }) => setAi(Boolean(j.available)))
      .catch(() => setAi(false));
  }, []);

  const fail = (err: unknown) => setStep({ k: 'error', error: err instanceof MedicineApiFailure ? err.kind : 'generic' });

  async function startFromBlob(blob: Blob, side: Side = 'front') {
    // A photo the browser cannot open throws PhotoError before the step changes, so CameraCapture (still on screen)
    // can show the JPG / PNG message.
    const { decodeImage, checkQuality } = await import('@/lib/ocr/canvas');
    const bitmap = await decodeImage(blob);
    setStep({ k: 'checking' });
    const report = checkQuality(bitmap);
    if (!report.ok) return setStep({ k: 'quality', bitmap, issues: report.issues, side });
    proceed(bitmap, side);
  }

  function proceed(bitmap: ImageBitmap, side: Side) {
    if (ai && consented === null) return setStep({ k: 'consent', bitmap, side });
    void read(bitmap, side, ai && consented === true);
  }

  async function readOnPhone(bitmap: ImageBitmap): Promise<PackReading> {
    setStep({ k: 'reading', percent: 0 });
    const [{ prepareForOcr }, { recognisePrinted }] = await Promise.all([import('@/lib/ocr/canvas'), import('@/lib/ocr/tesseract')]);
    const { canvas } = prepareForOcr(bitmap);
    const ocr = await recognisePrinted(canvas, (p) => setStep({ k: 'reading', percent: Math.round(p * 100) }));
    return readPack(ocr.text, ocr.words, ocr.lines);
  }

  async function read(bitmap: ImageBitmap, side: Side, useAi: boolean) {
    let r: PackReading;
    setNotice(null);
    try {
      if (useAi) {
        setStep({ k: 'reading' });
        try {
          const { bitmapToJpegBase64 } = await import('@/lib/image/photo');
          r = readingFromVision(await readPackWithAi(await bitmapToJpegBase64(bitmap)));
        } catch (err) {
          // Never silent: the user is told, the reason is kept (and logged on the server), then the phone reads it.
          const reason = err instanceof VisionError ? err.reason : 'unknown';
          console.warn(`[nirapod] AI pack reading unavailable: ${reason}`);
          setAiReason(reason);
          setNotice('aiFallback');
          r = await readOnPhone(bitmap);
        }
      } else {
        r = await readOnPhone(bitmap);
      }
    } catch {
      return setStep({ k: 'error', error: 'ocr' });
    }
    if (side === 'back' && reading) return addBack(r);
    setReading(r);
    if (r.source !== 'vision' && !isUsefulPackText(r.text)) return setStep({ k: 'unreadable', reading: r });
    await identify(r);
  }

  async function identify(r: PackReading) {
    try {
      setStep({ k: 'looking' });
      const id: IdentifyResponse = await identifyMedicine(evidenceFromReading(r));
      // The matching log explains every decision (what was read, each candidate's checks, why the best won).
      console.info('[nirapod] pack identification\n' + id.log.join('\n'));
      if (id.verdict === 'strong' && id.best) return show(r, id.best.product, id.candidates);
      if (id.verdict === 'weak' && id.candidates.length) return setStep({ k: 'notSure', reading: r, candidates: id.candidates });
      setStep({ k: 'notFound', reading: r });
    } catch (err) {
      fail(err);
    }
  }

  /** Back / side of the pack: merge, keep the chosen medicine, or identify again if it was not known yet. */
  async function addBack(back: PackReading) {
    const merged = reading ? mergeReadings(reading, back) : back;
    setReading(merged);
    setNotice('backAdded');
    if (lastResult) {
      // The medicine is already known (matched or chosen): the back adds dates, batch and DAR number.
      const next = { ...lastResult, reading: merged };
      setLastResult(next);
      return setStep(next);
    }
    await identify(merged);
  }

  async function show(r: PackReading | null, product: Product, candidates: ScoredCandidate[] = []) {
    try {
      setStep({ k: 'looking' });
      const alternatives = await fetchAlternatives(product.id);
      const next = { k: 'result' as const, reading: r, product, alternatives, candidates };
      setLastResult(next);
      setStep(next);
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
      const brands = results.filter((b) => !b.genericOnly);
      setStep({ k: 'confirm', reading, matches: brands, noMatchFor: brands.length ? undefined : q });
    } catch (err) {
      fail(err);
    }
  }

  function restart() {
    setReading(null);
    setQuery('');
    setConsented(null);
    setNotice(null);
    setAiReason(null);
    setLastResult(null);
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

  const backPhoto = (
    <div className="space-y-2 rounded-2xl border-2 border-dashed border-teal-700 bg-white p-3" data-testid="add-back">
      <p className="text-sm text-slate-700">{t('back.hint')}</p>
      <CameraCapture label={t('back.add')} onCapture={(f) => startFromBlob(f, 'back')} />
    </div>
  );

  const readAs = (r: PackReading | null) =>
    r && r.brandCandidates.length > 0 ? (
      <p className="text-slate-800" data-testid="read-as">
        {t('confirm.readAs', { words: r.brandCandidates.slice(0, 3).join(', ') })}
      </p>
    ) : null;

  const candidateLabel = (p: Product) => (
    <>
      <span className="block font-bold">
        {p.brand} {p.strength} · {p.form}
      </span>
      <span className="block text-sm text-slate-700">{[p.generic, p.manufacturer].filter(Boolean).join(' · ')}</span>
    </>
  );

  return (
    <section className="space-y-4" aria-labelledby="scan-title" data-testid="scan-pack" data-step={step.k}>
      <h2 id="scan-title" className="text-xl font-bold">
        {t('title')}
      </h2>

      {notice && (
        <div data-testid={`scan-notice-${notice}`} data-reason={notice === 'aiFallback' ? (aiReason ?? '') : undefined}>
          <Notice tone={notice === 'aiFallback' ? 'warning' : 'info'}>{notice === 'aiFallback' ? t('aiFallback') : t('back.added')}</Notice>
        </div>
      )}

      {step.k === 'idle' && (
        <div className="space-y-4">
          <p>{t('hint')}</p>
          <CameraCapture label={t('takePhoto')} onCapture={(f) => startFromBlob(f)} />
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
      {step.k === 'reading' && busy(step.percent === undefined ? t('steps.readingAi') : t('steps.reading', { percent: step.percent }), step.percent)}
      {step.k === 'looking' && busy(t('steps.identifying'))}

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
              onClick={() => proceed(step.bitmap, step.side)}
              className="min-h-12 flex-1 rounded-xl border-2 border-teal-800 px-3 font-bold text-teal-900"
            >
              {t('quality.continue')}
            </button>
          </div>
        </div>
      )}

      {step.k === 'consent' && (
        <div role="alertdialog" aria-labelledby="pack-consent-text" className="space-y-3 rounded-2xl border-2 border-amber-600 bg-amber-50 p-4" data-testid="pack-consent">
          <p id="pack-consent-text" className="font-semibold text-amber-950">
            {t('consent')}
          </p>
          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            <button
              type="button"
              data-testid="pack-consent-continue"
              onClick={() => {
                setConsented(true);
                void read(step.bitmap, step.side, true);
              }}
              className="min-h-12 rounded-xl bg-teal-800 px-3 font-bold text-white"
            >
              {t('consentContinue')}
            </button>
            <button
              type="button"
              data-testid="pack-consent-local"
              onClick={() => {
                setConsented(false);
                void read(step.bitmap, step.side, false);
              }}
              className="min-h-12 rounded-xl border-2 border-teal-800 px-3 font-bold text-teal-900"
            >
              {t('consentLocal')}
            </button>
          </div>
        </div>
      )}

      {step.k === 'notSure' && (
        <div className="space-y-3" data-testid="not-sure">
          <Notice tone="warning">
            <p className="text-lg font-bold">{t('notSure.title')}</p>
            <p>{t('notSure.hint')}</p>
          </Notice>
          {readAs(step.reading)}
          <ul className="space-y-2">
            {step.candidates.map((c) => (
              <li key={c.product.id}>
                <button
                  type="button"
                  data-testid="candidate"
                  data-brand={c.product.brand}
                  onClick={() => show(step.reading, c.product, step.candidates)}
                  className="flex min-h-14 w-full flex-col items-start rounded-xl border-2 border-slate-300 bg-white p-3 text-left hover:border-teal-800"
                >
                  {candidateLabel(c.product)}
                </button>
              </li>
            ))}
          </ul>
          {searchForm(t('notSure.typeName'))}
        </div>
      )}

      {step.k === 'notFound' && (
        <div className="space-y-3" data-testid="not-found">
          <Notice tone="warning">
            <p className="text-lg font-bold">{t('notFound.title')}</p>
            <p>{t('notFound.hint')}</p>
          </Notice>
          {readAs(step.reading)}
          <ExpiryCard dates={step.reading.dates} />
          {backPhoto}
          {searchForm(t('notSure.typeName'))}
          <button type="button" onClick={restart} className="min-h-12 w-full rounded-xl border-2 border-teal-800 px-4 font-bold text-teal-900">
            {t('result.scanAnother')}
          </button>
        </div>
      )}

      {step.k === 'unreadable' && (
        <div className="space-y-3" data-testid="unreadable">
          <Notice tone="warning">
            <p className="text-lg font-bold">{t('unreadable.title')}</p>
          </Notice>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="font-semibold">{t('unreadable.tipsTitle')}</p>
            <ul className="list-disc space-y-1 pl-5">
              {(['glare', 'box', 'steady', 'light'] as const).map((k) => (
                <li key={k}>{t(`unreadable.tips.${k}`)}</li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={restart} data-testid="unreadable-retake" className="min-h-12 w-full rounded-xl bg-teal-800 px-4 font-bold text-white">
            {t('quality.retake')}
          </button>
          {searchForm(t('notSure.typeName'))}
        </div>
      )}

      {step.k === 'confirm' && (
        <div className="space-y-4" data-testid="confirm-step">
          <h3 className="text-lg font-bold">{t('confirm.title')}</h3>
          {readAs(step.reading)}
          {step.noMatchFor && <Notice tone="warning">{t('confirm.noMatch', { query: step.noMatchFor })}</Notice>}
          {step.matches.length > 0 && (
            <ProductPicker
              key={step.matches.map((m) => m.brand).join('|')}
              matches={step.matches}
              initial={preselectProduct(step.matches, step.reading?.text ?? '')}
              onConfirm={(p) => show(step.reading, p)}
            />
          )}
          {searchForm(t('confirm.notListed'))}
        </div>
      )}

      {step.k === 'result' && (
        <div className="space-y-4">
          {readAs(step.reading)}
          <PackResults product={step.product} reading={step.reading} alternatives={step.alternatives} onRestart={restart} />
          {step.reading && backPhoto}
          {step.candidates.length > 1 && (
            <details className="rounded-2xl bg-white p-3 shadow-sm" data-testid="change-medicine">
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-teal-900">{t('change')}</summary>
              <ul className="mt-2 space-y-2">
                {step.candidates
                  .filter((c) => c.product.id !== step.product.id)
                  .map((c) => (
                    <li key={c.product.id}>
                      <button
                        type="button"
                        onClick={() => show(step.reading, c.product, step.candidates)}
                        className="flex min-h-14 w-full flex-col items-start rounded-xl border-2 border-slate-300 p-3 text-left"
                      >
                        {candidateLabel(c.product)}
                      </button>
                    </li>
                  ))}
              </ul>
              <div className="mt-2">{searchForm(t('notSure.typeName'))}</div>
            </details>
          )}
        </div>
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
