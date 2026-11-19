/**
 * Picks the language-model provider from environment variables (pure, unit-tested; no secrets leave the server).
 *
 * LLM_PROVIDER = "anthropic" | "gemini" chooses a provider when its key AND model are set. Otherwise whichever
 * provider is fully configured is used (Anthropic first, then Gemini). No model name is ever hard-coded:
 * ANTHROPIC_MODEL / GEMINI_MODEL come from the environment. Without a complete pair, AI is "not available".
 */
export type LlmProvider = 'anthropic' | 'gemini';

export interface LlmChoice {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}

type Env = Record<string, string | undefined>;

const PAIRS: Record<LlmProvider, [key: string, model: string]> = {
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'],
  gemini: ['GEMINI_API_KEY', 'GEMINI_MODEL'],
};

function configured(env: Env, provider: LlmProvider): LlmChoice | null {
  const [k, m] = PAIRS[provider];
  const apiKey = env[k]?.trim();
  const model = env[m]?.trim();
  return apiKey && model ? { provider, apiKey, model } : null;
}

export function selectLlm(env: Env = process.env): LlmChoice | null {
  const wanted = env.LLM_PROVIDER?.trim().toLowerCase();
  const order: LlmProvider[] = wanted === 'gemini' ? ['gemini', 'anthropic'] : ['anthropic', 'gemini'];
  for (const p of order) {
    const c = configured(env, p);
    if (c) return c;
  }
  return null;
}
