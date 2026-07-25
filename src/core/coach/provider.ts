import type { CoachMode } from '../db/schema';

// Types only. No network code, no SDK import — this file is what the rest of
// the app is allowed to know about the coach.

export interface CoachTurn {
  role: 'user' | 'coach';
  content: string;
}

export interface VocabContextEntry {
  term: string;
  glossZh: string;
}

export interface CoachTurnRequest {
  /** Persona + task instructions, from prompts/*.md. Cache-eligible. */
  systemPrompt: string;
  /** Title/author/chapter, ~50 tokens. Cache-eligible. */
  bookMetadata: string;
  rollingSummary: string | null;
  lookbackUnitsText: string[];
  currentUnitText: string;
  recentTurns: CoachTurn[];
  vocabContext: VocabContextEntry[] | null;
  userMessage: string;
  mode: CoachMode;
}

export type CoachStreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'message_stop' }
  | { type: 'error'; message: string };

export type CoachProviderId = 'mock' | 'anthropic';

export interface CoachProvider {
  readonly id: CoachProviderId;
  streamTurn(
    request: CoachTurnRequest,
    signal: AbortSignal,
  ): AsyncGenerator<CoachStreamEvent>;
  summarize(
    unitsText: string[],
    previousSummary: string | null,
  ): Promise<string>;
}
