/**
 * ONNX Runtime Web session loader (WASM backend, self-hosted under /ort/<version>/ — no CDN, works offline).
 *
 * Models live in /models/<name>.onnx with metadata in /models/<name>.json. The .onnx is requested as
 * /models/<name>.onnx?v=<meta.version>, so it can be cached as immutable and a new version is picked up through the
 * (always revalidated) metadata. A missing or broken model returns { status: 'missing' } — callers show
 * "model not loaded yet"; the app never crashes.
 */
export interface ModelMeta {
  name: string;
  version: string;
  classes: string[];
  inputSize: [number, number];
  mean: [number, number, number];
  std: [number, number, number];
  min_confidence: number;
}

export type ModelState =
  | { status: 'ready'; meta: ModelMeta; session: unknown }
  | { status: 'missing'; reason: string };

export interface LoadProgress {
  loaded: number;
  /** null when the server does not send Content-Length. */
  total: number | null;
}

export function isModelMeta(v: unknown): v is ModelMeta {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  const triple = (x: unknown) => Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === 'number');
  return (
    typeof m.version === 'string' &&
    Array.isArray(m.classes) &&
    m.classes.length > 0 &&
    m.classes.every((c) => typeof c === 'string') &&
    Array.isArray(m.inputSize) &&
    m.inputSize.length === 2 &&
    triple(m.mean) &&
    triple(m.std) &&
    typeof m.min_confidence === 'number' &&
    m.min_confidence > 0 &&
    m.min_confidence < 1
  );
}

export const modelUrl = (name: string, meta: Pick<ModelMeta, 'version'>) => `/models/${name}.onnx?v=${encodeURIComponent(meta.version)}`;

/** Metadata, or null if missing / invalid. Always revalidated with the server when online. */
export async function fetchModelMeta(name: string, fetcher: typeof fetch = fetch): Promise<ModelMeta | null> {
  try {
    const res = await fetcher(`/models/${name}.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return isModelMeta(json) ? { ...json, name: (json as ModelMeta).name ?? name } : null;
  } catch {
    return null;
  }
}

/** Size of the .onnx in bytes (HEAD request): null if unknown, 0 if the file is missing. */
export async function modelSize(url: string, fetcher: typeof fetch = fetch): Promise<number | null> {
  try {
    const res = await fetcher(url, { method: 'HEAD' });
    if (!res.ok) return 0;
    const len = Number(res.headers.get('content-length'));
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return null;
  }
}

/** True if the model file is already in the service-worker cache on this phone (no download needed). */
export async function isModelCached(url: string): Promise<boolean> {
  try {
    return typeof caches !== 'undefined' && Boolean(await caches.match(url));
  } catch {
    return false;
  }
}

/** Downloads a file and reports progress. Throws on HTTP errors. */
export async function fetchWithProgress(
  url: string,
  onProgress?: (p: LoadProgress) => void,
  fetcher: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const lengthHeader = Number(res.headers.get('content-length'));
  const total = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress?.({ loaded: buf.byteLength, total: total ?? buf.byteLength });
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress?.({ loaded, total });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ loaded, total });
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

const cache = new Map<string, Promise<ModelState>>();

export function loadModel(name: string, onProgress?: (p: LoadProgress) => void): Promise<ModelState> {
  let p = cache.get(name);
  if (!p) {
    p = doLoad(name, onProgress).then((state) => {
      if (state.status === 'missing') cache.delete(name); // allow a retry later
      return state;
    });
    cache.set(name, p);
  }
  return p;
}

async function doLoad(name: string, onProgress?: (p: LoadProgress) => void): Promise<ModelState> {
  const meta = await fetchModelMeta(name);
  if (!meta) return { status: 'missing', reason: 'metadata missing or invalid' };
  try {
    const bytes = await fetchWithProgress(modelUrl(name, meta), onProgress);
    const ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.wasmPaths = `/ort/${ort.env.versions.web}/`;
    ort.env.wasm.numThreads = 1; // no cross-origin isolation → no threads; avoids a failed worker start
    const session = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'] });
    return { status: 'ready', meta, session };
  } catch (err) {
    return { status: 'missing', reason: err instanceof Error ? err.message : String(err) };
  }
}
