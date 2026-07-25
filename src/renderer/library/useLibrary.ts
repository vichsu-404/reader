import { useCallback, useEffect, useState } from 'react';

import { getDb } from '../../core/db/client';
import { listBooks } from '../../core/db/queries';
import type { BookRow } from '../../core/db/schema';
import { importBook } from '../../core/ingest/import';
import { pickBookFile, readBookBytes, readBookText } from '../../main/fs';

type Status = 'loading' | 'idle' | 'importing';

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useLibrary() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const db = await getDb();
    setBooks(await listBooks(db));
    setStatus('idle');
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const db = await getDb();
        const loaded = await listBooks(db);
        if (!cancelled) {
          setBooks(loaded);
          setStatus('idle');
        }
      } catch (cause: unknown) {
        if (!cancelled) {
          setError(messageOf(cause));
          setStatus('idle');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const importFromDisk = useCallback(async (): Promise<string | null> => {
    setError(null);
    const picked = await pickBookFile();
    if (!picked) return null;

    setStatus('importing');
    try {
      const db = await getDb();
      const result = await importBook(db, {
        format: picked.format,
        fileName: picked.fileName,
        sourcePath: picked.path,
        ...(picked.format === 'epub'
          ? { bytes: await readBookBytes(picked.path) }
          : { text: await readBookText(picked.path) }),
      });
      await refresh();
      return result.book.id;
    } catch (cause: unknown) {
      setError(messageOf(cause));
      setStatus('idle');
      return null;
    }
  }, [refresh]);

  return { books, status, error, importFromDisk, refresh };
}
