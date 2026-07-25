import { useEffect, useState } from 'react';

import { getDb } from '../../core/db/client';
import { getBook, listUnits } from '../../core/db/queries';
import type { BookRow, UnitRow } from '../../core/db/schema';

const NO_UNITS: UnitRow[] = [];

interface LoadedBook {
  bookId: string;
  book: BookRow | null;
  units: UnitRow[];
}

export function useBookUnits(bookId: string) {
  const [loaded, setLoaded] = useState<LoadedBook | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const db = await getDb();
      const [book, units] = await Promise.all([
        getBook(db, bookId),
        listUnits(db, bookId),
      ]);
      if (!cancelled) setLoaded({ bookId, book, units });
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // Derived, so switching books reports `loading` immediately rather than
  // briefly showing the previous book's units.
  const current = loaded?.bookId === bookId ? loaded : null;

  return {
    book: current?.book ?? null,
    units: current?.units ?? NO_UNITS,
    loading: current === null,
  };
}
