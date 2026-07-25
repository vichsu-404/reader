import { useCallback, useEffect, useState } from 'react';

import { getDb } from '../../core/db/client';
import { listBooks } from '../../core/db/queries';
import type { BookRow } from '../../core/db/schema';
import { importBook } from '../../core/ingest/import';
import type { ImportInput } from '../../core/ingest/import';
import type { RematchCandidate } from '../../core/ingest/rematch';
import { pickBookFile, readBookBytes, readBookText } from '../../main/fs';

type Status = 'loading' | 'idle' | 'importing';

interface PendingImport {
  input: ImportInput;
  review: RematchCandidate[];
}

export type ImportOutcome =
  | { kind: 'imported'; bookId: string }
  | { kind: 'needs-review' }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useLibrary() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);

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

  const runImport = useCallback(
    async (
      source: PendingImport,
      accepted: readonly RematchCandidate[],
    ): Promise<ImportOutcome> => {
      setStatus('importing');
      try {
        const db = await getDb();
        const result = await importBook(db, source.input, accepted);
        await refresh();

        if (result.review.length > 0 && accepted.length === 0) {
          setPending({ ...source, review: result.review });
          return { kind: 'needs-review' };
        }

        setPending(null);
        return { kind: 'imported', bookId: result.book.id };
      } catch (cause: unknown) {
        setError(messageOf(cause));
        setStatus('idle');
        setPending(null);
        return { kind: 'failed' };
      }
    },
    [refresh],
  );

  const importFromDisk = useCallback(async (): Promise<ImportOutcome> => {
    setError(null);
    const picked = await pickBookFile();
    if (!picked) return { kind: 'cancelled' };

    const input = {
      format: picked.format,
      fileName: picked.fileName,
      sourcePath: picked.path,
      ...(picked.format === 'epub'
        ? { bytes: await readBookBytes(picked.path) }
        : { text: await readBookText(picked.path) }),
    };

    return runImport({ input, review: [] }, []);
  }, [runImport]);

  const resolveReview = useCallback(
    async (accepted: readonly RematchCandidate[]): Promise<ImportOutcome> => {
      if (!pending) return { kind: 'cancelled' };
      return runImport(pending, accepted);
    },
    [pending, runImport],
  );

  const cancelReview = useCallback(() => {
    setPending(null);
    setStatus('idle');
  }, []);

  return {
    books,
    status,
    error,
    pendingReview: pending?.review ?? null,
    importFromDisk,
    resolveReview,
    cancelReview,
    refresh,
  };
}
