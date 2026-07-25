import type { DbDriver } from './driver';

const migrationModules = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface MigrationFile {
  readonly name: string;
  readonly sql: string;
}

export function loadMigrations(): MigrationFile[] {
  return Object.entries(migrationModules)
    .map(([path, sql]) => ({
      name: path.slice(path.lastIndexOf('/') + 1),
      sql,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Split on `;`, dropping comments and blank statements. Migration SQL must not
 * contain a semicolon inside a string literal — see the header of 0001_init.sql.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function migrate(db: DbDriver): Promise<string[]> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name       TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  const applied = await db.select<{ name: string }>(
    'SELECT name FROM schema_migrations',
  );
  const appliedNames = new Set(applied.map((row) => row.name));

  const newlyApplied: string[] = [];
  for (const migration of loadMigrations()) {
    if (appliedNames.has(migration.name)) continue;

    for (const statement of splitStatements(migration.sql)) {
      await db.execute(statement);
    }
    await db.execute(
      'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
      [migration.name, new Date().toISOString()],
    );
    newlyApplied.push(migration.name);
  }

  return newlyApplied;
}
