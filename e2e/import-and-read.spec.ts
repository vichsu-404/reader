import { expect, test } from '@playwright/test';

import { openApp } from './fixtures';

test('imports an EPUB and renders one node per unit', async ({ page }) => {
  await openApp(page);

  await expect(page.getByTestId('empty-shelf')).toBeVisible();

  await page.getByTestId('import-book').click();

  // Import navigates straight into the reader.
  const units = page.locator('[data-unit-id]');
  await expect(units.first()).toBeVisible();
  await expect(units).toHaveCount(6);

  await expect(page.locator('.reader-header h2')).toHaveText(
    'Pride and Prejudice',
  );

  // Every unit carries a stable 16-char content hash, not an index.
  const ids = await units.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-unit-id')),
  );
  expect(new Set(ids).size).toBe(6);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{16}$/);

  // Navigation boilerplate is not part of the reading text.
  await expect(page.getByText('Skipped navigation')).toHaveCount(0);
  await expect(page.getByText('Skipped footer boilerplate.')).toHaveCount(0);
});

test('returns to the shelf with the imported book listed', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('import-book').click();
  await expect(page.locator('[data-unit-id]').first()).toBeVisible();

  await page.getByTestId('back-to-shelf').click();

  const card = page.getByTestId('book-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Pride and Prejudice');
  await expect(card).toContainText('Jane Austen');
});

test('selecting text offers a vocab affordance anchored to a unit', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('import-book').click();

  const secondUnit = page.locator('[data-unit-id]').nth(1);
  await expect(secondUnit).toBeVisible();

  await secondUnit.locator('.unit-text').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });

  await expect(page.getByTestId('selection-popover')).toBeVisible();
  await expect(page.getByTestId('add-vocab')).toBeVisible();
});
