/** Browser-side calls to the medicine API. Every query passes through redact() first (safety rule 9). */
import { redact } from '@/lib/privacy/redact';
import type { AlternativesResult, BrandMatch, DataInfo } from './repo';
import type { Identification, PackEvidence } from './identify';
import type { VisionPackFields } from '@/lib/ocr/pack';

export type MedicineApiError = 'offline' | 'dataMissing' | 'generic';

export class MedicineApiFailure extends Error {
  constructor(public readonly kind: MedicineApiError) {
    super(kind);
  }
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new MedicineApiFailure('offline');
  }
  if (res.status === 503) throw new MedicineApiFailure('dataMissing');
  if (!res.ok && res.status !== 404) throw new MedicineApiFailure('generic');
  return (await res.json()) as T;
}

export interface SearchResponse {
  query: string;
  results: BrandMatch[];
  data: DataInfo;
}

export type AlternativesResponse = Exclude<AlternativesResult, { status: 'not_found' }> & { data: DataInfo };

export function searchMedicines(query: string): Promise<SearchResponse> {
  const q = redact(query).replace(/\[[A-Z]+\]/g, ' ').trim();
  return getJson<SearchResponse>(`/api/medicines/search?q=${encodeURIComponent(q)}`);
}

export function fetchAlternatives(productId: number): Promise<AlternativesResponse> {
  return getJson<AlternativesResponse>(`/api/medicines/alternatives?id=${productId}`);
}

/** Searches each OCR brand candidate and merges the matches, best brand first, without duplicates. */
export async function searchCandidates(candidates: readonly string[], maxBrands = 6): Promise<BrandMatch[]> {
  const seen = new Map<string, BrandMatch>();
  for (const c of candidates.slice(0, 3)) {
    const { results } = await searchMedicines(c);
    for (const m of results) if (!seen.has(m.brand)) seen.set(m.brand, m);
  }
  return [...seen.values()].sort((a, b) => a.score - b.score).slice(0, maxBrands);
}

export interface NameSuggestion {
  name: string;
  kind: 'brand' | 'generic';
  generic: string | null;
}

/** Medicine-name autocomplete (brand and generic, Latin or Bangla), from the local medicine database. */
export async function suggestMedicineNames(query: string): Promise<NameSuggestion[]> {
  const q = redact(query).replace(/\[[A-Z]+\]/g, ' ').trim();
  const res = await getJson<{ suggestions: NameSuggestion[] }>(`/api/medicines/suggest?q=${encodeURIComponent(q)}`);
  return res.suggestions ?? [];
}

export interface NameMatch extends NameSuggestion {
  exact: boolean;
}

/** Closest medicine name for each name read on the phone (null where nothing is close). Redacted before sending. */
export async function matchMedicineNames(names: string[]): Promise<(NameMatch | null)[]> {
  let res: Response;
  try {
    res = await fetch('/api/medicines/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: names.map((n) => redact(n).replace(/\[[A-Z]+\]/g, ' ').trim()) }),
    });
  } catch {
    throw new MedicineApiFailure('offline');
  }
  if (res.status === 503) throw new MedicineApiFailure('dataMissing');
  if (!res.ok) throw new MedicineApiFailure('generic');
  return ((await res.json()) as { matches: (NameMatch | null)[] }).matches;
}

// ---------- medicine-pack identification ----------


export type IdentifyResponse = Identification & { data: DataInfo };

/** Verifies what was read against the medicine database (brand, then generic / strength / form / maker). */
export async function identifyMedicine(evidence: PackEvidence): Promise<IdentifyResponse> {
  let res: Response;
  try {
    res = await fetch('/api/medicines/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence }),
    });
  } catch {
    throw new MedicineApiFailure('offline');
  }
  if (res.status === 503) throw new MedicineApiFailure('dataMissing');
  if (!res.ok) throw new MedicineApiFailure('generic');
  return (await res.json()) as IdentifyResponse;
}

export type VisionFailure = 'not_available' | 'offline' | 'busy' | 'failed';

/** Reads a pack photo with the vision model (after consent). Throws a VisionFailure string on any problem. */
export async function readPackWithAi(image: { base64: string; mediaType: 'image/jpeg' }): Promise<VisionPackFields> {
  let res: Response;
  try {
    res = await fetch('/api/pack/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: image.base64, mediaType: image.mediaType }),
    });
  } catch {
    throw 'offline' satisfies VisionFailure;
  }
  if (res.status === 503) throw 'not_available' satisfies VisionFailure;
  if (res.status === 429) throw 'busy' satisfies VisionFailure;
  if (!res.ok) throw 'failed' satisfies VisionFailure;
  const json = (await res.json()) as { fields?: VisionPackFields };
  if (!json.fields) throw 'failed' satisfies VisionFailure;
  return json.fields;
}
