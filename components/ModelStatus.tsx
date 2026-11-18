'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { fetchModelMeta, isModelCached, loadModel, modelSize, modelUrl, type LoadProgress, type ModelMeta } from '@/lib/ai/session';
import Notice from './Notice';

type State =
  | { k: 'checking' }
  | { k: 'missing' }
  | { k: 'offer'; meta: ModelMeta; bytes: number | null }
  | { k: 'loading'; progress: LoadProgress }
  | { k: 'ready'; meta: ModelMeta };

/**
 * On-device model status. A model already on the phone loads by itself; otherwise the size is shown and the
 * download starts on tap (mobile data is expensive). A missing model shows "model not loaded yet"; never crashes.
 */
export default function ModelStatus({ name }: { name: string }) {
  const t = useTranslations('model');
  const format = useFormatter();
  const [state, setState] = useState<State>({ k: 'checking' });

  async function load() {
    setState({ k: 'loading', progress: { loaded: 0, total: null } });
    const result = await loadModel(name, (progress) => setState({ k: 'loading', progress }));
    setState(result.status === 'ready' ? { k: 'ready', meta: result.meta } : { k: 'missing' });
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const meta = await fetchModelMeta(name);
      if (!alive) return;
      if (!meta) return setState({ k: 'missing' });
      const url = modelUrl(name, meta);
      if (await isModelCached(url)) {
        if (alive) await load();
        return;
      }
      const bytes = await modelSize(url);
      if (!alive) return;
      setState(bytes === 0 ? { k: 'missing' } : { k: 'offer', meta, bytes });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per model name
  }, [name]);

  const mb = (bytes: number) => format.number(bytes / 1_000_000, { maximumFractionDigits: 1 });

  if (state.k === 'checking') return <p className="text-sm text-slate-600">{t('checking')}</p>;
  if (state.k === 'missing') {
    return (
      <div data-testid="model-not-loaded">
        <Notice tone="warning">{t('notLoaded')}</Notice>
      </div>
    );
  }
  if (state.k === 'offer') {
    return (
      <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm" data-testid="model-offer">
        <p>{t('downloadHint')}</p>
        <button type="button" onClick={load} data-testid="model-download" className="min-h-12 w-full rounded-xl bg-teal-800 px-4 font-bold text-white">
          {state.bytes ? t('download', { size: mb(state.bytes) }) : t('downloadUnknown')}
        </button>
      </div>
    );
  }
  if (state.k === 'loading') {
    const { loaded, total } = state.progress;
    const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : null;
    return (
      <div role="status" className="space-y-2 rounded-2xl bg-white p-4 shadow-sm" data-testid="model-loading">
        <p className="font-semibold">
          {pct !== null ? t('loading', { percent: pct, loaded: mb(loaded), total: mb(total!) }) : t('loadingBytes', { loaded: mb(loaded) })}
        </p>
        <div className="h-3 rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
          <div className={`h-3 rounded-full bg-teal-700 ${pct === null ? 'w-1/3 animate-pulse' : ''}`} style={pct !== null ? { width: `${pct}%` } : undefined} />
        </div>
      </div>
    );
  }
  return (
    <p className="text-sm text-green-800" data-testid="model-ready">
      ✓ {t('ready', { version: state.meta.version, classes: state.meta.classes.length })}
    </p>
  );
}
