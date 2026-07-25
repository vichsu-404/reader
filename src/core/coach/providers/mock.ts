import type {
  CoachProvider,
  CoachStreamEvent,
  CoachTurnRequest,
} from '../provider';

// Deterministic on purpose: e2e specs assert on the streamed text, and a
// non-deterministic mock would make those assertions flaky rather than useful.

const CHUNK_SIZE = 12;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function firstLongWord(text: string): string {
  const words = text.match(/[A-Za-z][A-Za-z'-]{5,}/g) ?? [];
  return words[0] ?? text.trim().split(/\s+/)[0] ?? 'word';
}

export function buildMockReply(request: CoachTurnRequest): string {
  if (request.mode === 'explain') {
    return [
      `【解釋】${request.currentUnitText.slice(0, 40)}…`,
      `生字：${firstLongWord(request.currentUnitText)} — 這裡指的是在此語境下的意思。`,
      '句構：這句的主要子句在前，後面接一個補充說明的子句。',
      request.rollingSummary
        ? `延續前文：${request.rollingSummary.slice(0, 30)}`
        : '這是目前對話的開頭。',
    ].join('\n');
  }

  return [
    `【回答】關於「${request.userMessage}」：`,
    '根據這一段的內容，可以這樣理解。',
  ].join('\n');
}

export function createMockProvider(): CoachProvider {
  return {
    id: 'mock',

    async *streamTurn(
      request: CoachTurnRequest,
      signal: AbortSignal,
    ): AsyncGenerator<CoachStreamEvent> {
      const reply = buildMockReply(request);

      for (let at = 0; at < reply.length; at += CHUNK_SIZE) {
        if (signal.aborted) {
          yield { type: 'error', message: 'aborted' };
          return;
        }
        yield { type: 'text_delta', delta: reply.slice(at, at + CHUNK_SIZE) };
      }

      yield {
        type: 'usage',
        inputTokens: estimateTokens(
          request.systemPrompt + request.currentUnitText + request.userMessage,
        ),
        outputTokens: estimateTokens(reply),
      };
      yield { type: 'message_stop' };
    },

    async summarize(unitsText, previousSummary) {
      const head = unitsText.at(-1)?.slice(0, 40) ?? '';
      return previousSummary
        ? `${previousSummary}；接著讀到「${head}」`
        : `目前讀到「${head}」`;
    },
  };
}
