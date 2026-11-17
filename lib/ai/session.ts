/**
 * ONNX Runtime Web session loader (WASM backend).
 * Models live in /models/<name>.onnx with metadata in /models/<name>.json.
 * A missing model returns { status: 'missing' } — callers show "model not loaded yet"; never crash.
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

const cache = new Map<string, Promise<ModelState>>();

export function loadModel(name: string): Promise<ModelState> {
  let p = cache.get(name);
  if (!p) {
    p = doLoad(name);
    cache.set(name, p);
  }
  return p;
}

async function doLoad(name: string): Promise<ModelState> {
  try {
    const metaRes = await fetch(`/models/${name}.json`);
    if (!metaRes.ok) return { status: 'missing', reason: `metadata ${metaRes.status}` };
    const meta = (await metaRes.json()) as ModelMeta;
    const ort = await import('onnxruntime-web');
    const session = await ort.InferenceSession.create(`/models/${name}.onnx`, {
      executionProviders: ['wasm'],
    });
    return { status: 'ready', meta, session };
  } catch (err) {
    return { status: 'missing', reason: err instanceof Error ? err.message : String(err) };
  }
}
