import { useState } from 'react';

import { Bookshelf } from './library/Bookshelf';
import { useLibrary } from './library/useLibrary';
import { ReaderView } from './reader/ReaderView';

type View = { name: 'library' } | { name: 'reader'; bookId: string };

export function App() {
  const [view, setView] = useState<View>({ name: 'library' });
  const { books, status, error, importFromDisk } = useLibrary();

  return (
    <main className="app-shell">
      {view.name === 'library' ? (
        <Bookshelf
          books={books}
          status={status}
          error={error}
          onImport={() => {
            void importFromDisk().then((bookId) => {
              if (bookId) setView({ name: 'reader', bookId });
            });
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
