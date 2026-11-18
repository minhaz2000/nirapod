/**
 * Server-only access to the Anthropic API. The key and model come from the environment
 * (ANTHROPIC_API_KEY, ANTHROPIC_MODEL) and are never sent to the client; no model name is hard-coded.
 * When either is missing, AI features report "not available" and the app uses its manual / template paths.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

export interface AnthropicConfig {
  client: Anthropic;
  model: string;
}

export function getAnthropic(): AnthropicConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim();
  if (!apiKey || !model) return null;
  return { client: new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 }), model };
}

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() && process.env.ANTHROPIC_MODEL?.trim());
}
