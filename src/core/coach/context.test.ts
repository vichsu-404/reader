import { describe, expect, it } from 'vitest';

import { applyTokenBudget, estimateTokens } from './context';
import { createMockProvider } from './providers/mock';
import type { CoachTurn, CoachTurnRequest } from './provider';

function turns(count: number, size: number): CoachTurn[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? ('user' as const) : ('coach' as const),
    content: `t${index}`.padEnd(size, 'x'),
  }));
}

function oversized(overrides: Partial<CoachTurnRequest> = {}): CoachTurnRequest {
  return {
    systemPrompt: 'S'.repeat(2000),
    bookMetadata: 'M'.repeat(200),
    rollingSummary: 'R'.repeat(400),
    lookbackUnitsText: ['L1'.padEnd(2000, 'a'), 'L2'.padEnd(2000, 'b')],
    currentUnitText: 'C'.repeat(1200),
    recentTurns: turns(6, 1200),
    vocabContext: Array.from({ length: 20 }, (_, i) => ({
      term: `term${i}`,
      glossZh: '意思'.repeat(10),
    })),
    userMessage: '解釋這段',
    mode: 'explain',
    ...overrides,
  };
}

describe('applyTokenBudget', () => {
  it('leaves an already-small request untouched', () => {
    const small: CoachTurnRequest = {
      ...oversized(),
      systemPrompt: 'S',
      lookbackUnitsText: ['L'],
      currentUnitText: 'C',
      recentTurns: turns(6, 10),
      vocabContext: [{ term: 'a', glossZh: 'b' }],
      rollingSummary: 'R',
    };
    expect(applyTokenBudget(small)).toEqual(small);
  });

  it('drops vocab first', () => {
    const trimmed = applyTokenBudget(oversized(), 3000);
    expect(trimmed.vocabContext).toBeNull();
  });

  it('follows the order vocab → turns 6→4→2 → lookback 2→1→0', () => {
    const seen: number[][] = [];
    for (const budget of [4000, 3000, 2000, 1200, 900]) {
      const trimmed = applyTokenBudget(oversized(), budget);
      seen.push([trimmed.recentTurns.length, trimmed.lookbackUnitsText.length]);
    }

    // Turn count is monotonically non-increasing as the budget shrinks, and
    // lookback is only sacrificed once turns are already at the floor.
    for (let i = 1; i < seen.length; i += 1) {
      const [turnCount, lookbackCount] = seen[i]!;
      const [prevTurns, prevLookback] = seen[i - 1]!;
      expect(turnCount!).toBeLessThanOrEqual(prevTurns!);
      if (lookbackCount! < prevLookback!) expect(turnCount).toBe(2);
    }
  });

  it('never drops the system prompt, current unit, user message, or last two turns', () => {
    const trimmed = applyTokenBudget(oversized(), 1);

    expect(trimmed.systemPrompt).toHaveLength(2000);
    expect(trimmed.currentUnitText).toHaveLength(1200);
    expect(trimmed.userMessage).toBe('解釋這段');
    expect(trimmed.recentTurns).toHaveLength(2);
    expect(trimmed.lookbackUnitsText).toEqual([]);
    expect(trimmed.vocabContext).toBeNull();
  });

  it('keeps the most recent turns, not the oldest', () => {
    const trimmed = applyTokenBudget(oversized(), 1);
    expect(trimmed.recentTurns.map((t) => t.content.slice(0, 2))).toEqual([
      't4',
      't5',
    ]);
  });

  it('estimates tokens as chars/4', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});

describe('mock provider', () => {
  it('streams a deterministic reply in chunks and reports usage', async () => {
    const provider = createMockProvider();
    const request = oversized({ currentUnitText: 'It is a truth.' });

    const deltas: string[] = [];
    let usage: { inputTokens: number; outputTokens: number } | null = null;
    let stopped = false;

    for await (const event of provider.streamTurn(
      request,
      new AbortController().signal,
    )) {
      if (event.type === 'text_delta') deltas.push(event.delta);
      if (event.type === 'usage') usage = event;
      if (event.type === 'message_stop') stopped = true;
    }

    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join('')).toContain('【解釋】');
    expect(usage?.outputTokens).toBeGreaterThan(0);
    expect(stopped).toBe(true);
  });

  it('is deterministic for the same request', async () => {
    const provider = createMockProvider();
    const collect = async () => {
      const parts: string[] = [];
      for await (const event of provider.streamTurn(
        oversized(),
        new AbortController().signal,
      )) {
        if (event.type === 'text_delta') parts.push(event.delta);
      }
      return parts.join('');
    };

    expect(await collect()).toBe(await collect());
  });

  it('stops early when aborted', async () => {
    const provider = createMockProvider();
    const controller = new AbortController();
    controller.abort();

    const events = [];
    for await (const event of provider.streamTurn(
      oversized(),
      controller.signal,
    )) {
      events.push(event);
    }

    expect(events).toEqual([{ type: 'error', message: 'aborted' }]);
  });
});
