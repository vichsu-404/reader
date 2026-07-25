import type { BookRow } from '../../core/db/schema';
import { ImportDialog } from './ImportDialog';

interface BookshelfProps {
  books: BookRow[];
  status: 'loading' | 'idle' | 'importing';
  error: string | null;
  onImport: () => void;
  onOpen: (bookId: string) => void;
}

export function Bookshelf({
  books,
  status,
  error,
  onImport,
  onOpen,
}: BookshelfProps) {
  return (
    <section className="bookshelf">
      <header className="bookshelf-header">
        <h1>書架</h1>
        <ImportDialog
          onImport={onImport}
          importing={status === 'importing'}
          error={error}
        />
      </header>

      {status === 'loading' ? <p className="dim">載入中…</p> : null}

      {status !== 'loading' && books.length === 0 ? (
        <p className="dim" data-testid="empty-shelf">
          還沒有書籍。匯入一本 EPUB 或 TXT 開始閱讀。
        </p>
      ) : null}

      <ul className="book-list">
        {books.map((book) => (
          <li key={book.id}>
            <button
              type="button"
              className="book-card"
              onClick={() => onOpen(book.id)}
              data-testid="book-card"
              data-book-id={book.id}
            >
              <span className="book-title">{book.title}</span>
              <span className="book-meta">
                {book.author ?? '未知作者'} · {book.unit_count} 段
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
