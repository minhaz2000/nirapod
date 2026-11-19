/**
 * Browser-side photo handling for the Nirapod Assistant: the same checked pipelines as the scan screens.
 * - Medicine pack: vision model after consent (or on-phone OCR) → verified against the database → name + expiry.
 * - Prescription: header cropped (names, phone, address) → handwriting reader after consent, or on-phone OCR matched
 *   to medicine names → lines the user must confirm (rule 7).
 * - Lab report: read on the phone only (the photo is not sent) → values checked against their ranges.
 * Skin photos are never accepted here.
 */
import { identifyMedicine, matchMedicineNames, readPackWithAi, VisionError } from '@/lib/medicine/client';
import type { ScoredCandidate } from '@/lib/medicine/identify';
import type { Product } from '@/lib/medicine/repo';
import { formatPackDate } from '@/lib/ocr/expiry';
import { evidenceFromReading, isUsefulPackText, readPack, readingFromVision, type PackReading } from '@/lib/ocr/pack';
import { expiryStatus } from '@/lib/rules/medicine';
import { checkReport, type CheckedValue } from '@/lib/rules/report-ranges';
import type { ExpiryCardStatus, MedicineSummary } from './types';

export type PhotoKind = 'pack' | 'prescription' | 'report';

export const toSummary = (p: Product): MedicineSummary => ({
  id: p.id,
  brand: p.brand,
  generic: p.generic,
  strength: p.strength,
  form: p.form,
  manufacturer: p.manufacturer,
  indication: p.indication ? (p.indication.length > 300 ? `${p.indication.slice(0, 300)}…` : p.indication) : null,
});

export interface PackOutcome {
  verdict: 'strong' | 'weak' | 'none' | 'unreadable';
  medicine: MedicineSummary | null;
  candidates: MedicineSummary[];
  expiry: ExpiryCardStatus;
  exp: string | null;
  /** Why the AI could not read it (shown, never silent). */
  aiReason?: string;
}

export interface RxLineDraft {
  medicine: string;
  strength: string;
  frequency: string;
  duration: string;
  state: 'pending' | 'confirmed' | 'removed';
}

async function ocr(bitmap: ImageBitmap, layout: 'sparse' | 'table' = 'sparse') {
  const [{ prepareForOcr }, { recognisePrinted }] = await Promise.all([import('@/lib/ocr/canvas'), import('@/lib/ocr/tesseract')]);
  return recognisePrinted(prepareForOcr(bitmap).canvas, undefined, layout);
}

export async function readPackPhoto(bitmap: ImageBitmap, useAi: boolean, today = new Date()): Promise<PackOutcome> {
  let reading: PackReading;
  let aiReason: string | undefined;
  if (useAi) {
    try {
      const { bitmapToJpegBase64 } = await import('@/lib/image/photo');
      reading = readingFromVision(await readPackWithAi(await bitmapToJpegBase64(bitmap)));
    } catch (err) {
      aiReason = err instanceof VisionError ? err.reason : 'unknown';
      console.warn(`[nirapod] AI pack reading unavailable: ${aiReason}`);
      const o = await ocr(bitmap);
      reading = readPack(o.text, o.words, o.lines);
    }
  } else {
    const o = await ocr(bitmap);
    reading = readPack(o.text, o.words, o.lines);
  }
  const e = expiryStatus(reading.dates, today);
  const expiry = { expiry: e.status, exp: reading.dates.exp ? formatPackDate(reading.dates.exp) : null };
  if (reading.source !== 'vision' && !isUsefulPackText(reading.text)) return { verdict: 'unreadable', medicine: null, candidates: [], ...expiry, aiReason };
  const id = await identifyMedicine(evidenceFromReading(reading));
  const candidates = id.candidates.map((c: ScoredCandidate) => toSummary(c.product));
  if (id.verdict === 'strong' && id.best) return { verdict: 'strong', medicine: toSummary(id.best.product), candidates, ...expiry, aiReason };
  return { verdict: id.verdict === 'weak' && candidates.length ? 'weak' : 'none', medicine: null, candidates, ...expiry, aiReason };
}

/** Prescription lines for the user to confirm. AI (after consent) reads handwriting; otherwise printed lines on the phone. */
export async function readPrescriptionPhoto(bitmap: ImageBitmap, useAi: boolean): Promise<{ lines: RxLineDraft[]; aiReason?: string }> {
  const [{ redactPrescriptionImage }, { DEFAULT_HEADER_FRACTION }] = await Promise.all([import('@/lib/privacy/redact-canvas'), import('@/lib/privacy/redact')]);
  const redacted = await redactPrescriptionImage(bitmap, DEFAULT_HEADER_FRACTION); // names, phone, address cut off
  let aiReason: string | undefined;
  if (useAi) {
    try {
      const res = await fetch('/api/handwriting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: redacted.base64, mediaType: redacted.mediaType }),
      });
      const json = (await res.json().catch(() => ({}))) as { items?: Array<{ medicine: string; strength: string; frequency: string; duration: string }>; reason?: string };
      if (res.ok && json.items) {
        URL.revokeObjectURL(redacted.previewUrl);
        return { lines: json.items.map((i) => ({ medicine: i.medicine, strength: i.strength, frequency: i.frequency, duration: i.duration, state: 'pending' })) };
      }
      aiReason = json.reason ?? `http_${res.status}`;
    } catch {
      aiReason = 'network';
    }
    console.warn(`[nirapod] AI prescription reading unavailable: ${aiReason}`);
  }
  const { decodeImage } = await import('@/lib/ocr/canvas');
  const cropped = await decodeImage(await (await fetch(redacted.previewUrl)).blob());
  URL.revokeObjectURL(redacted.previewUrl);
  const { parseRxText } = await import('@/lib/ocr/prescription');
  const read = parseRxText((await ocr(cropped, 'table')).text);
  const matches = read.length ? await matchMedicineNames(read.map((r) => r.name)).catch(() => read.map(() => null)) : [];
  return {
    lines: read.map((r, i) => ({ medicine: matches[i]?.name ?? r.name, strength: r.strength, frequency: r.frequency, duration: r.duration, state: 'pending' })),
    aiReason,
  };
}

/** Lab report values, read on the phone (the photo is never sent). */
export async function readReportPhoto(bitmap: ImageBitmap): Promise<CheckedValue[]> {
  const { parseReport } = await import('@/lib/ocr/report');
  return checkReport(parseReport((await ocr(bitmap, 'table')).text));
}
