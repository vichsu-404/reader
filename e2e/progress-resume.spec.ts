import { expect, test } from '@playwright/test';

import { openApp } from './fixtures';

test('reopening a book resumes at the exact saved unit', async ({ page }) => {
  await openApp(page, { persist: true });
  await page.getByTestId('import-book').click();

  const units = page.locator('[data-unit-id]');
  await expect(units.first()).toBeVisible();

  // Advance to the fourth paragraph and remember its content hash.
  const target = units.nth(3);
  await target.click();
  await expect(target).toHaveClass(/current/);
  const savedUnitId = await target.getAttribute('data-unit-id');

  await page.getByTestId('back-to-shelf').click();
  await page.getByTestId('book-card').click();

  await expect(
    page.locator(`[data-unit-id="${savedUnitId}"]`),
  ).toHaveClass(/current/);
  // Not the first paragraph — i.e. resume actually happened.
  await expect(units.first()).not.toHaveClass(/current/);
});

test('progress survives a full page reload', async ({ page }) => {
  await openApp(page, { persist: true });
  await page.getByTestId('import-book').click();

  const units = page.locator('[data-unit-id]');
  await expect(units.first()).toBeVisible();
  await units.nth(2).click();
  const savedUnitId = await units.nth(2).getAttribute('data-unit-id');

  await page.reload();
  await page.getByTestId('book-card').click();

  await expect(
    page.locator(`[data-unit-id="${savedUnitId}"]`),
  ).toHaveClass(/current/);
});

test('keyboard navigation advances the saved position', async ({ page }) => {
  await openApp(page, { persist: true });
  await page.getByTestId('import-book').click();
  await expect(page.locator('[data-unit-id]').first()).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');

  const current = page.locator('[data-unit-id].current');
  await expect(current).toHaveAttribute('data-seq', '2');

  await page.getByTestId('back-to-shelf').click();
  await page.getByTestId('book-card').click();
  await expect(page.locator('[data-unit-id].current')).toHaveAttribute(
    'data-seq',
    '2',
  );
});
