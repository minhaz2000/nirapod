import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fetchModelMeta, fetchWithProgress, isModelMeta, modelSize, modelUrl } from '@/lib/ai/session';

const FOOD_META = JSON.parse(readFileSync('public/models/food_seg.json', 'utf8'));

describe('model metadata', () => {
  it('the trained food_seg.json from Kaggle is valid for the app', () => {
    expect(isModelMeta(FOOD_META)).toBe(true);
    expect(FOOD_META.classes).toHaveLength(16);
    expect(FOOD_META.inputSize).toEqual([640, 640]);
    expect(FOOD_META.min_confidence).toBeGreaterThan(0.25);
  });

  it('rejects broken metadata (→ "model not loaded yet", no crash)', () => {
    expect(isModelMeta(null)).toBe(false);
    expect(isModelMeta({ ...FOOD_META, classes: [] })).toBe(false);
    expect(isModelMeta({ ...FOOD_META, mean: [0, 0] })).toBe(false);
    expect(isModelMeta({ ...FOOD_META, min_confidence: 1.5 })).toBe(false);
  });

  it('the weights URL carries the version, so it can be cached as immutable', () => {
    expect(modelUrl('food_seg', FOOD_META)).toBe('/models/food_seg.onnx?v=0.1.0');
  });

  it('fetchModelMeta: null on 404, network error or invalid JSON', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(FOOD_META), { status: 200 }));
    expect((await fetchModelMeta('food_seg', ok as unknown as typeof fetch))?.version).toBe('0.1.0');
    expect(ok).toHaveBeenCalledWith('/models/food_seg.json', { cache: 'no-cache' });
    expect(await fetchModelMeta('x', (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch)).toBeNull();
    expect(await fetchModelMeta('x', (async () => new Response('{not json', { status: 200 })) as unknown as typeof fetch)).toBeNull();
    expect(await fetchModelMeta('x', (async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch)).toBeNull();
  });
});

describe('downloads', () => {
  it('modelSize reads Content-Length; 0 when the file is missing', async () => {
    const head = (status: number, len?: string) =>
      (async () => new Response(null, { status, headers: len ? { 'content-length': len } : {} })) as unknown as typeof fetch;
    expect(await modelSize('/m.onnx', head(200, '11700578'))).toBe(11_700_578);
    expect(await modelSize('/m.onnx', head(404))).toBe(0);
    expect(await modelSize('/m.onnx', head(200))).toBeNull();
  });

  it('fetchWithProgress streams the body and reports progress', async () => {
    const parts = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6])];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        parts.forEach((p) => c.enqueue(p));
        c.close();
      },
    });
    const fetcher = (async () => new Response(body, { headers: { 'content-length': '6' } })) as unknown as typeof fetch;
    const seen: Array<[number, number | null]> = [];
    const buf = await fetchWithProgress('/m.onnx', (p) => seen.push([p.loaded, p.total]), fetcher);
    expect([...new Uint8Array(buf)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seen).toEqual([
      [0, 6],
      [3, 6],
      [5, 6],
      [6, 6],
    ]);
  });

  it('fetchWithProgress throws on HTTP errors (caller shows "model not loaded yet")', async () => {
    await expect(fetchWithProgress('/m.onnx', undefined, (async () => new Response('', { status: 404 })) as unknown as typeof fetch)).rejects.toThrow('404');
  });
});
