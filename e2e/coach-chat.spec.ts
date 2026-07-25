import { expect, test } from '@playwright/test';

import { openApp } from './fixtures';

test('Explain streams a coach reply and persists it with token counts', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('import-book').click();

  const secondUnit = page.locator('[data-unit-id]').nth(1);
  await expect(secondUnit).toBeVisible();
  await secondUnit.getByTestId('explain-button').click();

  const coachTurn = page.getByTestId('turn-coach');
  await expect(coachTurn).toHaveCount(1);
  await expect(coachTurn).toContainText('【解釋】');
  await expect(coachTurn).toContainText('生字：');

  // Usage is recorded per message, not just displayed.
  await expect(coachTurn.locator('.turn-meta')).toContainText('out');
  await expect(coachTurn.locator('.turn-meta')).not.toContainText('0 out');

  // The reply is anchored to the paragraph it explains.
  const unitId = await secondUnit.getAttribute('data-unit-id');
  await expect(coachTurn).toHaveAttribute('data-unit-id', unitId!);
});

test('free-form questions work alongside Explain', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('import-book').click();
  await expect(page.locator('[data-unit-id]').first()).toBeVisible();

  await page.getByTestId('ask-input').fill('這裡的 truth 是什麼意思？');
  await page.getByTestId('ask-submit').click();

  await expect(page.getByTestId('turn-user')).toContainText('truth');
  await expect(page.getByTestId('turn-coach')).toContainText('【回答】');
});

test('chat history survives leaving and reopening the book', async ({
  page,
}) => {
  await openApp(page, { persist: true });
  await page.getByTestId('import-book').click();

  await page.locator('[data-unit-id]').nth(1).getByTestId('explain-button').click();
  await expect(page.getByTestId('turn-coach')).toHaveCount(1);

  await page.getByTestId('back-to-shelf').click();
  await page.getByTestId('book-card').click();

  await expect(page.getByTestId('turn-coach')).toHaveCount(1);
  await expect(page.getByTestId('turn-user')).toHaveCount(1);
});
