export type SqlValue = string | number | null;

/**
 * The seam between queries.ts and whatever SQLite is underneath: the Tauri SQL
 * plugin in production, node:sqlite under Vitest, sql.js under Playwright.
 * Placeholders are always `?` — the one bind syntax all three accept.
 */
export interface DbDriver {
  execute(sql: string, params?: readonly SqlValue[]): Promise<void>;
  select<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
}
