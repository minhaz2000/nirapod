/** Browser-side calls to the medicine API. Every query passes through redact() first (safety rule 9). */
import { redact } from '@/lib/privacy/redact';
import type { AlternativesResult, BrandMatch, DataInfo } from './repo';

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
