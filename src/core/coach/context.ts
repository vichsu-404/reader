import type { DbDriver } from '../db/driver';
import {
  getDefaultCoachProfile,
  listRecentMessages,
  listRecentVocab,
  listUnitsBefore,
} from '../db/queries';
import type { BookRow, CoachMode, UnitRow } from '../db/schema';
import systemPrompt from './prompts/system.md?raw';
import type { CoachTurn, CoachTurnRequest, VocabContextEntry } from './provider';

/** chars/4 — deliberately crude, and deliberately conservative. DECISIONS 011. */
const TOKEN_BUDGET = 3000;
const MAX_TURNS = 6;
const MAX_TURN_CHARS = 300;
const MAX_LOOKBACK = 2;
const MAX_VOCAB = 20;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function requestTokens(request: CoachTurnRequest): number {
  const vocab = (request.vocabContext ?? [])
    .map((entry) => `${entry.term}${entry.glossZh}`)
    .join('');

  return estimateTokens(
    [
      request.systemPrompt,
      request.bookMetadata,
      request.rollingSummary ?? '',
      request.lookbackUnitsText.join(''),
      request.currentUnitText,
      request.recentTurns.map((turn) => turn.content).join(''),
      vocab,
      request.userMessage,
    ].join(''),
  );
}

/**
 * Trims in a fixed order until the estimate fits. The system prompt, the
 * current unit, the user's message, and the two most recent turns are never
 * dropped — without those the coach cannot answer at all, so an over-budget
 * request is better than an unanswerable one.
 */
export function applyTokenBudget(
  request: CoachTurnRequest,
  budget = TOKEN_BUDGET,
): CoachTurnRequest {
  const reductions: ((current: CoachTurnRequest) => CoachTurnRequest)[] = [
    (current) => ({ ...current, vocabContext: null }),
    (current) => ({ ...current, recentTurns: current.recentTurns.slice(-4) }),
    (current) => ({ ...current, recentTurns: current.recentTurns.slice(-2) }),
    (current) => ({
      ...current,
      lookbackUnitsText: current.lookbackUnitsText.slice(-1),
    }),
    (current) => ({ ...current, lookbackUnitsText: [] }),
  ];

  let trimmed = request;
  for (const reduce of reductions) {
    if (requestTokens(trimmed) <= budget) return trimmed;
    trimmed = reduce(trimmed);
  }
  return trimmed;
}

function truncateTurn(content: string): string {
  return content.length > MAX_TURN_CHARS
    ? `${content.slice(0, MAX_TURN_CHARS)}…`
    : content;
}

export interface AssembleOptions {
  book: BookRow;
  unit: UnitRow;
  sessionId: string;
  rollingSummary: string | null;
  userMessage: string;
  mode: CoachMode;
}

export async function assembleTurnRequest(
  db: DbDriver,
  options: AssembleOptions,
): Promise<CoachTurnRequest> {
  const { book, unit } = options;

  const [profile, lookback, messages, vocab] = await Promise.all([
    getDefaultCoachProfile(db),
    listUnitsBefore(db, book.id, unit.seq, MAX_LOOKBACK),
    listRecentMessages(db, options.sessionId, MAX_TURNS),
    listRecentVocab(db, book.id, MAX_VOCAB),
  ]);

  const persona = profile
    ? `讀者程度：${profile.level}／目標語言：${profile.target_locale}`
    : '';

  const recentTurns: CoachTurn[] = messages.map((message) => ({
    role: message.role === 'coach' ? 'coach' : 'user',
    content: truncateTurn(message.content),
  }));

  const vocabContext: VocabContextEntry[] = vocab.map((entry) => ({
    term: entry.term,
    glossZh: entry.gloss_zh,
  }));

  return applyTokenBudget({
    systemPrompt,
    bookMetadata: [
      `書名：${book.title}`,
      `作者：${book.author ?? '未知'}`,
      `章節：第 ${unit.chapter_index + 1} 章`,
      persona,
    ]
      .filter((line) => line.length > 0)
      .join('\n'),
    rollingSummary: options.rollingSummary,
    lookbackUnitsText: lookback.map((row) => row.text),
    currentUnitText: unit.text,
    recentTurns,
    vocabContext: vocabContext.length > 0 ? vocabContext : null,
    userMessage: options.userMessage,
    mode: options.mode,
  });
}
