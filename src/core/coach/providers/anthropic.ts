import Anthropic from '@anthropic-ai/sdk';

import type {
  CoachProvider,
  CoachStreamEvent,
  CoachTurnRequest,
} from '../provider';
import summarizePrompt from '../prompts/summarize.md?raw';

// The only file permitted to import @anthropic-ai/sdk or open a network
// connection. ESLint enforces both — see eslint.config.js.

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 2048;

/**
 * `low` effort suits this workload: each turn is a short, scoped explanation of
 * one paragraph, and the reader is waiting on the stream. Thinking stays on
 * (the model's default) — disabling it on this model can leak internal tags
 * into the visible response.
 */
const EFFORT = 'low';

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  output_config: { effort: string };
  system: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[];
  messages: { role: 'user' | 'assistant'; content: string }[];
}

function renderContext(request: CoachTurnRequest): string {
  const sections: string[] = [];

  if (request.rollingSummary) {
    sections.push(`<目前為止>\n${request.rollingSummary}\n</目前為止>`);
  }
  if (request.lookbackUnitsText.length > 0) {
    sections.push(
      `<前文>\n${request.lookbackUnitsText.join('\n\n')}\n</前文>`,
    );
  }
  if (request.vocabContext && request.vocabContext.length > 0) {
    const entries = request.vocabContext
      .map((entry) => `${entry.term} — ${entry.glossZh}`)
      .join('\n');
    sections.push(`<讀者已記錄的單字>\n${entries}\n</讀者已記錄的單字>`);
  }
  sections.push(`<本段>\n${request.currentUnitText}\n</本段>`);

  return sections.join('\n\n');
}

/**
 * Pure — no network, no SDK client. Split out so the request shape is unit
 * testable without an API key, which is the only way it gets tested at all
 * until a key exists.
 */
export function buildAnthropicRequest(
  request: CoachTurnRequest,
): AnthropicRequest {
  // The system prompt is the stable prefix, so the cache breakpoint goes on it.
  // Book metadata sits after the breakpoint: it is only ~50 tokens and changes
  // per chapter, so caching it would break the entry on every chapter turn.
  const system: AnthropicRequest['system'] = [
    {
      type: 'text',
      text: request.systemPrompt,
      cache_control: { type: 'ephemeral' },
    },
    { type: 'text', text: request.bookMetadata },
  ];

  // A conversation must open with a user turn.
  const turns = [...request.recentTurns];
  while (turns[0]?.role === 'coach') turns.shift();

  const messages: AnthropicRequest['messages'] = turns.map((turn) => ({
    role: turn.role === 'coach' ? ('assistant' as const) : ('user' as const),
    content: turn.content,
  }));

  messages.push({
    role: 'user',
    content: `${renderContext(request)}\n\n${request.userMessage}`,
  });

  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    system,
    messages,
  };
}

export function createAnthropicProvider(apiKey: string): CoachProvider {
  const client = new Anthropic({
    apiKey,
    // The "browser" here is the app's own Tauri webview, and the key comes from
    // the OS keyring rather than page JavaScript, so the usual key-exposure
    // reasoning behind this guard does not apply.
    dangerouslyAllowBrowser: true,
  });

  return {
    id: 'anthropic',

    async *streamTurn(
      request: CoachTurnRequest,
      signal: AbortSignal,
    ): AsyncGenerator<CoachStreamEvent> {
      const stream = client.beta.messages.stream(
        {
          ...buildAnthropicRequest(request),
          // Safety classifiers can decline a request outright; this re-runs it
          // on Anthropic's recommended fallback rather than surfacing a refusal.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        } as Parameters<typeof client.beta.messages.stream>[0],
        { signal },
      );

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield { type: 'text_delta', delta: event.delta.text };
        }
      }

      const final = await stream.finalMessage();

      if (final.stop_reason === 'refusal') {
        yield {
          type: 'error',
          message: '這段內容被安全機制擋下了，請換個問法或跳過這一段。',
        };
        return;
      }

      yield {
        type: 'usage',
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      };
      yield { type: 'message_stop' };
    },

    async summarize(unitsText, previousSummary) {
      const body = [
        previousSummary ? `<前次摘要>\n${previousSummary}\n</前次摘要>` : null,
        `<新讀到的段落>\n${unitsText.join('\n\n')}\n</新讀到的段落>`,
      ]
        .filter((section): section is string => section !== null)
        .join('\n\n');

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 512,
        output_config: { effort: EFFORT },
        system: summarizePrompt,
        messages: [{ role: 'user', content: body }],
      });

      return response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
    },
  };
}
