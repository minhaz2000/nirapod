import { describe, expect, it } from 'vitest';
import { selectLlm } from '@/lib/server/llm-select';

const A = { ANTHROPIC_API_KEY: 'a-key', ANTHROPIC_MODEL: 'a-model' };
const G = { GEMINI_API_KEY: 'g-key', GEMINI_MODEL: 'g-model' };

describe('LLM provider selection', () => {
  it('no key → not available (the app uses typing, suggestions and templates)', () => {
    expect(selectLlm({})).toBeNull();
    expect(selectLlm({ LLM_PROVIDER: 'gemini' })).toBeNull();
  });

  it('a key without a model is not enough (no model name is hard-coded)', () => {
    expect(selectLlm({ ANTHROPIC_API_KEY: 'a-key' })).toBeNull();
    expect(selectLlm({ GEMINI_API_KEY: 'g-key', GEMINI_MODEL: '  ' })).toBeNull();
  });

  it('uses whichever provider is configured', () => {
    expect(selectLlm(A)).toEqual({ provider: 'anthropic', apiKey: 'a-key', model: 'a-model' });
    expect(selectLlm(G)).toEqual({ provider: 'gemini', apiKey: 'g-key', model: 'g-model' });
  });

  it('LLM_PROVIDER chooses when both are configured (case and spaces ignored)', () => {
    expect(selectLlm({ ...A, ...G })?.provider).toBe('anthropic');
    expect(selectLlm({ ...A, ...G, LLM_PROVIDER: 'anthropic' })?.provider).toBe('anthropic');
    expect(selectLlm({ ...A, ...G, LLM_PROVIDER: ' Gemini ' })?.provider).toBe('gemini');
  });

  it('falls back to the provider whose key is present', () => {
    expect(selectLlm({ ...A, LLM_PROVIDER: 'gemini' })?.provider).toBe('anthropic');
    expect(selectLlm({ ...G, LLM_PROVIDER: 'anthropic' })?.provider).toBe('gemini');
    expect(selectLlm({ ...G, LLM_PROVIDER: 'openai' })?.provider).toBe('gemini');
  });

  it('trims values', () => {
    expect(selectLlm({ GEMINI_API_KEY: ' g-key\n', GEMINI_MODEL: ' g-model ' })).toEqual({ provider: 'gemini', apiKey: 'g-key', model: 'g-model' });
  });
});
