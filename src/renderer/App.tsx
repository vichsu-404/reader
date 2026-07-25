import { useState } from 'react';

import { Bookshelf } from './library/Bookshelf';
import { ReimportReview } from './library/ReimportReview';
import { useLibrary } from './library/useLibrary';
import type { ImportOutcome } from './library/useLibrary';
import { ReaderView } from './reader/ReaderView';

type View = { name: 'library' } | { name: 'reader'; bookId: string };

export function App() {
  const [view, setView] = useState<View>({ name: 'library' });
  const {
    books,
    status,
    error,
    pendingReview,
    importFromDisk,
    resolveReview,
    cancelReview,
  } = useLibrary();

  const openIfImported = (outcome: ImportOutcome) => {
    if (outcome.kind === 'imported') {
      setView({ name: 'reader', bookId: outcome.bookId });
    }
  };

  if (pendingReview) {
    return (
      <main className="app-shell">
        <ReimportReview
          candidates={pendingReview}
          onResolve={(accepted) => {
            void resolveReview(accepted).then(openIfImported);
          }}
          onCancel={cancelReview}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      {view.name === 'library' ? (
        <Bookshelf
          books={books}
          status={status}
          error={error}
          onImport={() => {
            void importFromDisk().then(openIfImported);
          }}
          onOpen={(bookId) => setView({ name: 'reader', bookId })}
        />
      ) : (
        <ReaderView
          bookId={view.bookId}
          onBack={() => setView({ name: 'library' })}
        />
      )}
    </main>
  );
}
