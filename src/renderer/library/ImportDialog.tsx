interface ImportDialogProps {
  onImport: () => void;
  importing: boolean;
  error: string | null;
}

export function ImportDialog({
  onImport,
  importing,
  error,
}: ImportDialogProps) {
  return (
    <div className="import">
      <button
        type="button"
        className="primary"
        onClick={onImport}
        disabled={importing}
        data-testid="import-book"
      >
        {importing ? '匯入中…' : '匯入書籍 (EPUB / TXT)'}
      </button>
      {error ? (
        <p className="error" role="alert" data-testid="import-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
