import Database from '@tauri-apps/plugin-sql';

import type { DbDriver, SqlValue } from './driver';
import { migrate } from './migrate';

const DB_URL = 'sqlite:reading-coach.db';

function toDriver(database: Database): DbDriver {
  return {
    async execute(sql, params = []) {
      await database.execute(sql, params as unknown[]);
    },
    async select<T>(sql: string, params: readonly SqlValue[] = []) {
      return database.select<T[]>(sql, params as unknown[]);
    },
  };
}

let connection: Promise<DbDriver> | null = null;

/** Opens the app database, running any pending migrations exactly once. */
export function getDb(): Promise<DbDriver> {
  connection ??= (async () => {
    const database = await Database.load(DB_URL);
    const driver = toDriver(database);
    await driver.execute('PRAGMA foreign_keys = ON');
    await migrate(driver);
    return driver;
  })();
  return connection;
}
