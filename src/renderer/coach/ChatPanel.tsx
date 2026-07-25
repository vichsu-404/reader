import { useState } from 'react';

import type { MessageRow, UnitRow } from '../../core/db/schema';
import type { StreamingReply } from './useCoachChat';

interface ChatPanelProps {
  messages: MessageRow[];
  streaming: StreamingReply | null;
  error: string | null;
  currentUnit: UnitRow | undefined;
  onAsk: (unit: UnitRow, question: string) => void;
  onSaveMessage: (message: MessageRow) => void;
}

export function ChatPanel({
  messages,
  streaming,
  error,
  currentUnit,
  onAsk,
  onSaveMessage,
}: ChatPanelProps) {
  const [question, setQuestion] = useState('');

  return (
    <aside className="chat" data-testid="chat-panel">
      <header className="chat-header">
        <h3>閱讀教練</h3>
      </header>

      <div className="chat-log" data-testid="chat-log">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`turn ${message.role}`}
            data-testid={`turn-${message.role}`}
            data-message-id={message.id}
            data-unit-id={message.unit_id ?? ''}
          >
            <div className="turn-body">{message.content}</div>
            {message.role === 'coach' ? (
              <div className="turn-meta">
                <span className="dim">
                  {message.input_tokens} in / {message.output_tokens} out
                </span>
                <button
                  type="button"
                  onClick={() => onSaveMessage(message)}
                  data-testid="save-message"
                >
                  存成筆記
                </button>
              </div>
            ) : null}
          </article>
        ))}

        {streaming ? (
          <article className="turn coach streaming" data-testid="turn-streaming">
            <div className="turn-body">{streaming.text}</div>
          </article>
        ) : null}
      </div>

      {error ? (
        <p className="error" role="alert" data-testid="chat-error">
          {error}
        </p>
      ) : null}

      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = question.trim();
          if (!currentUnit || trimmed.length === 0) return;
          onAsk(currentUnit, trimmed);
          setQuestion('');
        }}
      >
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="對這一段有什麼問題？"
          data-testid="ask-input"
        />
        <button type="submit" disabled={!currentUnit} data-testid="ask-submit">
          送出
        </button>
      </form>
    </aside>
  );
}
