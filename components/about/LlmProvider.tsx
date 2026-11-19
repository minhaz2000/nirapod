'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/Icon';

type Provider = 'anthropic' | 'gemini' | null;

/** Says which language-model provider this deployment uses (name only; keys and models stay on the server). */
export default function LlmProvider() {
  const t = useTranslations('about.ai');
  const tp = useTranslations('medicine.explain.provider');
  const [state, setState] = useState<{ k: 'loading' } | { k: 'done'; provider: Provider }>({ k: 'loading' });

  useEffect(() => {
    fetch('/api/handwriting')
      .then((r) => r.json())
      .then((j: { available: boolean; provider?: Provider }) => setState({ k: 'done', provider: j.available ? (j.provider ?? null) : null }))
      .catch(() => setState({ k: 'done', provider: null }));
  }, []);

  return (
    <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm" data-testid="about-llm" data-provider={state.k === 'done' ? (state.provider ?? 'none') : 'loading'}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Icon name="doc" size={20} />
        {t('llmTitle')}
      </h2>
      <p>{t('llm')}</p>
      <p className="font-semibold" data-testid="about-llm-current">
        {state.k === 'loading' ? t('llmChecking') : state.provider ? t('llmCurrent', { provider: tp(state.provider) }) : t('llmNone')}
      </p>
    </section>
  );
}
