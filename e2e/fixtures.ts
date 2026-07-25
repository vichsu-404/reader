import type { Page } from '@playwright/test';

import {
  DEFAULT_FIXTURE_CHAPTERS,
  buildFixtureEpub,
} from '../src/core/ingest/epub-fixture';
import type { FixtureChapter } from '../src/core/ingest/epub-fixture';

export { DEFAULT_FIXTURE_CHAPTERS };
export type { FixtureChapter };

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export interface OpenOptions {
  chapters?: FixtureChapter[];
  /** Keep the sql.js database across reloads, so resume can be tested. */
  persist?: boolean;
}

/**
 * Opens the app with the mocked-IPC harness installed and a synthetic EPUB
 * staged behind the fake file picker. The EPUB is built in memory rather than
 * committed as a binary fixture.
 */
export async function openApp(
  page: Page,
  options: OpenOptions = {},
): Promise<void> {
  const bytes = await buildFixtureEpub(
    options.chapters ? { chapters: options.chapters } : {},
  );

  const params = new URLSearchParams({
    e2e: '1',
    bookFile: toBase64(bytes),
    bookPath: '/books/fixture.epub',
  });
  if (options.persist) params.set('persist', '1');

  await page.goto(`/?${params.toString()}`);
}

/** Reloads while keeping the same harness configuration — used by resume specs. */
export async function reloadApp(page: Page): Promise<void> {
  await page.reload();
}
