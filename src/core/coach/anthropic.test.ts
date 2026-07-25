import { describe, expect, it } from 'vitest';

import { buildAnthropicRequest } from './providers/anthropic';
import type { CoachTurnRequest } from './provider';

function makeRequest(
  overrides: Partial<CoachTurnRequest> = {},
): CoachTurnRequest {
  return {
    systemPrompt: 'SYSTEM',
    bookMetadata: 'Pride and Prejudice / Jane Austen / Chapter 1',
    rollingSummary: null,
    lookbackUnitsText: [],
    currentUnitText: 'It is a truth universally acknowledged.',
    recentTurns: [],
    vocabContext: null,
    userMessage: '解釋這段',
    mode: 'explain',
    ...overrides,
  };
}

describe('buildAnthropicRequest', () => {
  it('caches the system prompt but not the per-chapter metadata', () => {
    const request = buildAnthropicRequest(makeRequest());

    expect(request.system[0]?.text).toBe('SYSTEM');
    expect(request.system[0]?.cache_control).toEqual({ type: 'ephemeral' });
    // Metadata changes every chapter; caching it would break the entry.
    expect(request.system[1]?.cache_control).toBeUndefined();
  });

  it('places the current unit and user message in the final user turn', () => {
    const request = buildAnthropicRequest(makeRequest());
    const last = request.messages.at(-1);

    expect(last?.role).toBe('user');
    expect(last?.content).toContain('It is a truth universally acknowledged.');
    expect(last?.content).toContain('解釋這段');
  });

  it('maps coach turns to assistant turns', () => {
    const request = buildAnthropicRequest(
      makeRequest({
        recentTurns: [
          { role: 'user', content: 'q1' },
          { role: 'coach', content: 'a1' },
        ],
      }),
    );

    expect(request.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
  });

  it('drops leading coach turns so the conversation opens with a user turn', () => {
    const request = buildAnthropicRequest(
      makeRequest({
        recentTurns: [
          { role: 'coach', content: 'orphaned' },
          { role: 'user', content: 'q1' },
        ],
      }),
    );

    expect(request.messages[0]?.role).toBe('user');
    expect(request.messages[0]?.content).toBe('q1');
  });

  it('includes summary, lookback, and vocab only when present', () => {
    const bare = buildAnthropicRequest(makeRequest());
    expect(bare.messages.at(-1)?.content).not.toContain('<前文>');
    expect(bare.messages.at(-1)?.content).not.toContain('<目前為止>');

    const full = buildAnthropicRequest(
      makeRequest({
        rollingSummary: 'so far',
        lookbackUnitsText: ['previous paragraph'],
        vocabContext: [{ term: 'truth', glossZh: '真理' }],
      }),
    );
    const content = full.messages.at(-1)?.content ?? '';
    expect(content).toContain('<目前為止>');
    expect(content).toContain('previous paragraph');
    expect(content).toContain('truth — 真理');
  });

  it('omits sampling parameters, which this model rejects', () => {
    const request = buildAnthropicRequest(makeRequest());
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('top_p');
    expect(request).not.toHaveProperty('top_k');
  });
});
