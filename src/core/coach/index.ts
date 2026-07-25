import type { CoachProvider } from './provider';
import { createMockProvider } from './providers/mock';

export type { CoachProvider } from './provider';

/**
 * Defaults to the mock. The real provider is selected only when a key exists in
 * the OS keyring *and* the reader has enabled it in settings — so the app is
 * fully usable, and fully testable, without a key.
 */
export async function createCoachProvider(
  loadApiKey: () => Promise<string | null>,
  enabled: boolean,
): Promise<CoachProvider> {
  if (!enabled) return createMockProvider();

  const apiKey = await loadApiKey();
  if (!apiKey) return createMockProvider();

  const { createAnthropicProvider } = await import('./providers/anthropic');
  return createAnthropicProvider(apiKey);
}
