import { useState } from 'react';

import { useCoachSettings } from './useCoachSettings';

interface ApiKeySettingsProps {
  onClose: () => void;
}

export function ApiKeySettings({ onClose }: ApiKeySettingsProps) {
  const { enabled, hasKey, error, setUseRealProvider, storeKey, clearKey } =
    useCoachSettings();
  const [draft, setDraft] = useState('');

  return (
    <section className="settings" data-testid="settings">
      <header className="settings-header">
        <button type="button" onClick={onClose} data-testid="settings-close">
          ← 返回
        </button>
        <h2>設定</h2>
      </header>

      <div className="settings-body">
        <h3>Anthropic API 金鑰</h3>
        <p className="dim">
          金鑰只會存在作業系統的鑰匙圈中，不會寫入資料庫、設定檔或紀錄檔。
        </p>

        <p data-testid="key-status">
          目前狀態：
          {hasKey === null ? '檢查中…' : hasKey ? '已儲存' : '尚未設定'}
        </p>

        <form
          className="settings-row"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = draft.trim();
            if (trimmed.length === 0) return;
            void storeKey(trimmed);
            setDraft('');
          }}
        >
          <input
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
            data-testid="api-key-input"
          />
          <button type="submit" className="primary" data-testid="api-key-save">
            儲存
          </button>
          <button
            type="button"
            onClick={() => void clearKey()}
            disabled={hasKey !== true}
            data-testid="api-key-clear"
          >
            刪除
          </button>
        </form>

        <label className="settings-row">
          <input
            type="checkbox"
            checked={enabled}
            disabled={hasKey !== true}
            onChange={(event) => setUseRealProvider(event.target.checked)}
            data-testid="use-real-provider"
          />
          使用真實的 Anthropic 教練（關閉時使用內建的離線範例回覆）
        </label>

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
