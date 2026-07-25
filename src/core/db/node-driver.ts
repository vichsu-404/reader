import { DatabaseSync } from 'node:sqlite';

import type { DbDriver, SqlValue } from './driver';
import { migrate } from './migrate';

/**
 * Test-only driver. Node 22 ships SQLite, so unit tests run the real migrations
 * and the real queries without any extra dependency. Never imported by app code.
 */
export async function createTestDb(): Promise<DbDriver> {
  const database = new DatabaseSync(':memory:');

  const driver: DbDriver = {
    async execute(sql, params: readonly SqlValue[] = []) {
      database.prepare(sql).run(...params);
    },
    async select<T>(sql: string, params: readonly SqlValue[] = []) {
      return database.prepare(sql).all(...params) as T[];
    },
  };

  await driver.execute('PRAGMA foreign_keys = ON');
  await migrate(driver);
  return driver;
}
