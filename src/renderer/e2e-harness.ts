import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/**
 * Test seam for Playwright. Loaded only when `import.meta.env.DEV` and the page
 * is opened with `?e2e=1`, so it is dead-code-eliminated from production builds.
 *
 * plugin-sql is backed by a real sql.js database rather than canned rows, so
 * migrations and every function in queries.ts run for real and src/core/db/
 * client.ts is exercised unmodified. See docs/DECISIONS.md 009.
 */

const SNAPSHOT_KEY = 'e2e-db-snapshot';

interface HarnessConfig {
  /** Bytes the fake picker returns, base64-encoded by the spec. */
  bookFileBase64: string | null;
  bookFilePath: string;
  bookFileText: string | null;
  /** Keep the database across reloads, so resume can be tested. */
  persist: boolean;
}

function readConfig(): HarnessConfig {
  const params = new URLSearchParams(location.search);
  return {
    bookFileBase64: params.get('bookFile'),
    bookFilePath: params.get('bookPath') ?? '/books/fixture.epub',
    bookFileText: params.get('bookText'),
    persist: params.get('persist') === '1',
  };
}

function base64ToBytes(base64: string): number[] {
  const binary = atob(base64);
  return Array.from(binary, (character) => character.charCodeAt(0));
}

export async function installE2EHarness(): Promise<void> {
  const config = readConfig();
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });

  const snapshot = config.persist
    ? sessionStorage.getItem(SNAPSHOT_KEY)
    : null;
  const database = snapshot
    ? new SQL.Database(Uint8Array.from(JSON.parse(snapshot) as number[]))
    : new SQL.Database();

  const persist = () => {
    if (!config.persist) return;
    sessionStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify(Array.from(database.export())),
    );
  };

  mockWindows('main');
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;

    switch (command) {
      case 'plugin:sql|load':
        return 'sqlite:e2e.db';

      case 'plugin:sql|close':
        return true;

      case 'plugin:sql|execute': {
        database.run(args['query'] as string, args['values'] as never);
        persist();
        return [1, 0];
      }

      case 'plugin:sql|select': {
        const result = database.exec(
          args['query'] as string,
          args['values'] as never,
        );
        const first = result[0];
        if (!first) return [];
        return first.values.map((row) =>
          Object.fromEntries(
            first.columns.map((column, index) => [column, row[index] ?? null]),
          ),
        );
      }

      case 'plugin:dialog|open':
        return config.bookFileBase64 || config.bookFileText
          ? config.bookFilePath
          : null;

      case 'plugin:fs|read_file':
        return config.bookFileBase64
          ? base64ToBytes(config.bookFileBase64)
          : [];

      case 'plugin:fs|read_text_file':
        return Array.from(
          new TextEncoder().encode(config.bookFileText ?? ''),
        );

      default:
        throw new Error(`unmocked Tauri command: ${command}`);
    }
  });
}
