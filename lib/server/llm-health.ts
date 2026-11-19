/** Pure helpers for /api/llm/health (unit-tested). */

/**
 * Which listed Gemini models suit Nirapod (image input + JSON + search): stable "flash" / "pro" text models first,
 * newest version first. Excludes embedding, audio / TTS, live, image-generation and experimental variants.
 */
export function suggestGeminiModels(ids: readonly string[], max = 5): string[] {
  const usable = ids.filter((id) => /^gemini-/.test(id) && !/embed|tts|audio|live|image-generation|imagen|veo|aqa|robotics|computer-use|-exp\b|exp-|learnlm/i.test(id));
  const version = (id: string) => Number(id.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const rank = (id: string) =>
    (/preview/.test(id) ? 2 : 0) + (/lite/.test(id) ? 1 : 0) + (/flash/.test(id) ? 0 : /pro/.test(id) ? 0.5 : 3) + (/-\d{3,}$|-latest$/.test(id) ? 0.2 : 0);
  return [...usable].sort((a, b) => version(b) - version(a) || rank(a) - rank(b) || a.localeCompare(b)).slice(0, max);
}

export type HealthError =
  | 'missing_key'
  | 'missing_model'
  | 'invalid_key'
  | 'invalid_model'
  | 'quota'
  | 'permission'
  | 'network'
  | 'timeout'
  | 'refused'
  | 'incomplete'
  | 'bad_response'
  | 'unknown';

/** What to do about each error, for the health report. */
export const HEALTH_ADVICE: Record<HealthError, string> = {
  missing_key: 'Set GEMINI_API_KEY (or ANTHROPIC_API_KEY) in the Vercel project settings and redeploy.',
  missing_model: 'Set GEMINI_MODEL (or ANTHROPIC_MODEL) to one of the model IDs listed in "models" and redeploy.',
  invalid_key:
    'The key was rejected. Copy the whole key again from Google AI Studio (AQ. keys are long; check nothing was cut off), make sure it belongs to a project with the Generative Language API, and redeploy.',
  invalid_model: 'GEMINI_MODEL is not a model this key can use. Set it to one of the IDs in "suggested" (exactly as written) and redeploy.',
  quota: 'The key has no quota left (free-tier limit or billing). Wait, raise the quota, or enable billing on the Google project.',
  permission: 'The key is not allowed to use the Gemini API (API disabled, key restricted, or region not supported). Check the key restrictions in Google Cloud.',
  network: 'The server could not reach the AI provider, or the provider had a server error. Try again in a minute.',
  timeout: 'The AI provider did not answer in time. Try again in a minute.',
  refused: 'The provider blocked the test prompt. This should not happen; try again.',
  incomplete: 'The test answer was cut off, but the call itself worked.',
  bad_response: 'The provider answered in an unexpected format.',
  unknown: 'Unexpected error; see "message".',
};
