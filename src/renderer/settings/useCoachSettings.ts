import { useCallback, useEffect, useState } from 'react';

import { deleteApiKey, loadApiKey, saveApiKey } from '../../main/keyring';

// The key itself lives in the OS keyring. Only this non-secret toggle is
// stored locally — it is a UI preference, not a credential, so it does not
// justify a schema change.
const ENABLED_KEY = 'coach.provider.anthropic.enabled';

export function useCoachSettings() {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem(ENABLED_KEY) === '1',
  );
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadApiKey()
      .then((key) => {
        if (!cancelled) setHasKey(key !== null && key.length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasKey(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setUseRealProvider = useCallback((next: boolean) => {
    localStorage.setItem(ENABLED_KEY, next ? '1' : '0');
    setEnabled(next);
  }, []);

  const storeKey = useCallback(async (apiKey: string) => {
    setError(null);
    try {
      await saveApiKey(apiKey);
      setHasKey(true);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const clearKey = useCallback(async () => {
    setError(null);
    try {
      await deleteApiKey();
      setHasKey(false);
      setUseRealProvider(false);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [setUseRealProvider]);

  return { enabled, hasKey, error, setUseRealProvider, storeKey, clearKey };
}

/** Read outside React — the coach factory needs it at request time. */
export function isRealProviderEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === '1';
}
