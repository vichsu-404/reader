import { useCallback, useEffect, useRef, useState } from 'react';

import { createCoachProvider } from '../../core/coach';
import { assembleTurnRequest } from '../../core/coach/context';
import type { CoachProvider } from '../../core/coach/provider';
import { getDb } from '../../core/db/client';
import {
  getOrCreateSession,
  insertMessage,
  listRecentMessages,
  touchSession,
} from '../../core/db/queries';
import type {
  BookRow,
  CoachMode,
  MessageRow,
  UnitRow,
} from '../../core/db/schema';
import { loadApiKey } from '../../main/keyring';
import { isRealProviderEnabled } from '../settings/useCoachSettings';

const HISTORY_LIMIT = 30;

export interface StreamingReply {
  unitId: string | null;
  text: string;
}

export function useCoachChat(book: BookRow | null) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [streaming, setStreaming] = useState<StreamingReply | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providerRef = useRef<Promise<CoachProvider> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const bookId = book?.id ?? null;

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;

    void (async () => {
      const db = await getDb();
      const session = await getOrCreateSession(db, bookId, 'default');
      const history = await listRecentMessages(db, session.id, HISTORY_LIMIT);
      if (cancelled) return;
      setSessionId(session.id);
      setMessages(history);
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const send = useCallback(
    async (unit: UnitRow, userMessage: string, mode: CoachMode) => {
      if (!book || !sessionId) return;

      setError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const db = await getDb();
      providerRef.current ??= createCoachProvider(
        loadApiKey,
        isRealProviderEnabled(),
      );
      const provider = await providerRef.current;

      await insertMessage(db, {
        sessionId,
        bookId: book.id,
        unitId: unit.unit_id,
        role: 'user',
        mode,
        content: userMessage,
        providerId: provider.id,
        inputTokens: 0,
        outputTokens: 0,
      });
      setMessages(await listRecentMessages(db, sessionId, HISTORY_LIMIT));
      setStreaming({ unitId: unit.unit_id, text: '' });

      const request = await assembleTurnRequest(db, {
        book,
        unit,
        sessionId,
        rollingSummary: null,
        userMessage,
        mode,
      });

      let reply = '';
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        for await (const event of provider.streamTurn(
          request,
          controller.signal,
        )) {
          if (event.type === 'text_delta') {
            reply += event.delta;
            setStreaming({ unitId: unit.unit_id, text: reply });
          } else if (event.type === 'usage') {
            inputTokens = event.inputTokens;
            outputTokens = event.outputTokens;
          } else if (event.type === 'error') {
            setError(event.message);
          }
        }
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }

      setStreaming(null);

      if (reply.length > 0) {
        await insertMessage(db, {
          sessionId,
          bookId: book.id,
          unitId: unit.unit_id,
          role: 'coach',
          mode,
          content: reply,
          providerId: provider.id,
          inputTokens,
          outputTokens,
        });
        await touchSession(db, sessionId);
        setMessages(await listRecentMessages(db, sessionId, HISTORY_LIMIT));
      }
    },
    [book, sessionId],
  );

  const explain = useCallback(
    (unit: UnitRow) => send(unit, '請解釋這一段。', 'explain'),
    [send],
  );

  const ask = useCallback(
    (unit: UnitRow, question: string) => send(unit, question, 'ask'),
    [send],
  );

  return { messages, streaming, error, explain, ask, sessionId };
}
