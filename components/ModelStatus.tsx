'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { loadModel, type ModelState } from '@/lib/ai/session';
import Notice from './Notice';

/** Shows "model not loaded yet" when public/models/<name>.onnx is missing; never crashes. */
export default function ModelStatus({ name }: { name: string }) {
  const t = useTranslations('model');
  const [state, setState] = useState<ModelState | null>(null);
  useEffect(() => {
    let alive = true;
    loadModel(name).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [name]);
  if (!state || state.status === 'ready') return null;
  return (
    <div data-testid="model-not-loaded">
      <Notice tone="warning">{t('notLoaded')}</Notice>
    </div>
  );
}
