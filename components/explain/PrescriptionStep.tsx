'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import CameraCapture from '@/components/CameraCapture';
import Notice from '@/components/Notice';
import { DEMO_DIAGNOSIS, DEMO_PRESCRIPTION_LINES } from '@/lib/demo/prescription';
import { DEFAULT_HEADER_FRACTION } from '@/lib/privacy/redact';
import type { RedactedImage } from '@/lib/privacy/redact-canvas';
import type { HandwritingItem } from '@/app/api/handwriting/route';
import RxLineEditor from './RxLineEditor';
import { newLineId, type RxLine } from './types';

interface Props {
  ai: boolean | null;
  demo: boolean;
  lines: RxLine[];
  setLines: Dispatch<SetStateAction<RxLine[]>>;
  diagnosis: string;
  onDiagnosis: (d: string) => void;
}

type RxNotice = 'notAvailable' | 'failed' | 'demoLines' | 'readByAi' | null;

const toLines = (items: readonly HandwritingItem[], source: RxLine['source']): RxLine[] =>
  items.map((i) => ({
    id: newLineId(),
    medicine: i.medicine,
    strength: i.strength,
    frequency: i.frequency,
    duration: i.duration,
    confidence: i.confidence,
    source,
    confirmed: false,
    product: null,
  }));

export default function PrescriptionStep({ ai, demo, lines, setLines, diagnosis, onDiagnosis }: Props) {
  const t = useTranslations('medicine.explain');
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [isDemoImage, setIsDemoImage] = useState(false);
  const [fraction, setFraction] = useState(DEFAULT_HEADER_FRACTION);
  const [redacted, setRedacted] = useState<RedactedImage | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<RxNotice>(null);
  const previewRef = useRef<string | null>(null);

  // Rule 9: the header is cropped off and the preview shows exactly what would be sent.
  useEffect(() => {
    if (!bitmap) return;
    let alive = true;
    import('@/lib/privacy/redact-canvas')
      .then(({ redactPrescriptionImage }) => redactPrescriptionImage(bitmap, fraction))
      .then((r) => {
        if (!alive) return URL.revokeObjectURL(r.previewUrl);
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = r.previewUrl;
        setRedacted(r);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [bitmap, fraction]);

  async function onPhoto(blob: Blob, fromDemo = false) {
    const { decodeImage } = await import('@/lib/ocr/canvas');
    setBitmap(await decodeImage(blob)); // PhotoError reaches CameraCapture, which shows the JPG / PNG message
    setIsDemoImage(fromDemo);
    setNotice(null);
    // If the photo arrives before the availability check finished, ask now instead of guessing.
    const available =
      ai ??
      (await fetch('/api/handwriting')
        .then((r) => r.json())
        .then((j: { available: boolean }) => j.available)
        .catch(() => false));
    if (!available) applyFallback(fromDemo);
  }

  function applyFallback(fromDemo: boolean) {
    if (fromDemo) {
      setLines((prev) => [...prev, ...toLines(DEMO_PRESCRIPTION_LINES, 'demo')]);
      if (!diagnosis) onDiagnosis(DEMO_DIAGNOSIS);
      setNotice('demoLines');
    } else {
      setNotice('notAvailable');
    }
  }

  async function send() {
    if (!redacted) return;
    setSending(true);
    try {
      const res = await fetch('/api/handwriting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: redacted.base64, mediaType: redacted.mediaType }),
      });
      if (res.status === 503) {
        applyFallback(isDemoImage);
        if (!isDemoImage) setNotice('notAvailable');
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const { items } = (await res.json()) as { items: HandwritingItem[] };
      setLines((prev) => [...prev, ...toLines(items, 'ai')]);
      const dx = items.map((i) => i.diagnosis_if_written).find(Boolean);
      if (dx && !diagnosis) onDiagnosis(dx);
      setNotice('readByAi');
    } catch {
      setNotice('failed');
    } finally {
      setSending(false);
    }
  }

  const pending = lines.filter((l) => !l.confirmed).length;

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm" data-testid="rx-step">
      <h3 className="text-lg font-bold">{t('rx.title')}</h3>
      <CameraCapture label={t('rx.add')} onCapture={(f) => onPhoto(f)} />
      {demo && (
        <button
          type="button"
          data-testid="sample-prescription"
          onClick={async () => onPhoto(await (await fetch('/samples/prescription.png')).blob(), true)}
          className="min-h-11 rounded-xl border-2 border-dashed border-teal-700 px-3 font-semibold text-teal-900"
        >
          {t('demoPrescription')}
        </button>
      )}

      {bitmap && ai !== false && (
        <div className="space-y-2 rounded-xl border-2 border-slate-200 p-3" data-testid="rx-crop">
          <p className="font-semibold">{t('rx.cropTitle')}</p>
          <p className="text-sm text-slate-700">{t('rx.cropHint')}</p>
          <label className="block">
            <span className="text-sm">{t('rx.cropSlider', { percent: Math.round(fraction * 100) })}</span>
            <input
              type="range"
              min={0}
              max={0.6}
              step={0.01}
              value={fraction}
              onChange={(e) => setFraction(Number(e.target.value))}
              className="h-11 w-full accent-teal-800"
            />
          </label>
          {redacted && (
            <>
              <p className="text-sm font-semibold">{t('rx.preview')}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={redacted.previewUrl} alt={t('rx.preview')} className="max-h-72 w-full rounded-lg border object-contain" data-testid="rx-preview" />
            </>
          )}
          <p className="text-sm text-slate-700">{t('rx.privacy')}</p>
          <button
            type="button"
            disabled={!redacted || sending}
            onClick={send}
            data-testid="rx-send"
            className="min-h-12 w-full rounded-xl bg-teal-800 px-4 font-bold text-white disabled:opacity-50"
          >
            {sending ? t('rx.sending') : t('rx.send')}
          </button>
        </div>
      )}

      {notice && (
        <div data-testid={`rx-notice-${notice}`}>
          <Notice tone={notice === 'readByAi' ? 'info' : 'warning'}>{t(`rx.${notice}`)}</Notice>
        </div>
      )}

      <label className="block">
        <span className="font-semibold">{t('rx.diagnosis')}</span>
        <input
          value={diagnosis}
          onChange={(e) => onDiagnosis(e.target.value)}
          data-testid="rx-diagnosis"
          className="min-h-12 w-full rounded-xl border-2 border-slate-400 px-3"
        />
      </label>

      <div className="space-y-2">
        <p className="font-semibold">{t('rx.linesTitle')}</p>
        {lines.length === 0 && <p className="text-sm text-slate-700">{t('rx.noLines')}</p>}
        <ul className="space-y-2">
          {lines.map((l) => (
            <RxLineEditor
              key={l.id}
              line={l}
              onChange={(update) => setLines((prev) => prev.map((x) => (x.id === l.id ? update(x) : x)))}
              onRemove={() => setLines((prev) => prev.filter((x) => x.id !== l.id))}
            />
          ))}
        </ul>
        <button
          type="button"
          data-testid="add-line"
          onClick={() =>
            setLines((prev) => [
              ...prev,
              { id: newLineId(), medicine: '', strength: '', frequency: '', duration: '', confidence: null, source: 'manual', confirmed: false, product: null },
            ])
          }
          className="min-h-12 w-full rounded-xl border-2 border-teal-800 px-4 font-bold text-teal-900"
        >
          + {t('rx.addLine')}
        </button>
        {pending > 0 && (
          <p className="text-sm font-semibold text-amber-900" data-testid="must-confirm">
            {t('rx.mustConfirm', { count: pending })}
          </p>
        )}
      </div>
    </section>
  );
}
