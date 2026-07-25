import { expect, test } from '@playwright/test';

import { openApp } from './fixtures';

test('all three capture paths resolve unit_id correctly', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('import-book').click();

  const secondUnit = page.locator('[data-unit-id]').nth(1);
  await expect(secondUnit).toBeVisible();
  const unitId = await secondUnit.getAttribute('data-unit-id');

  // 1. Selection — anchors to the enclosing paragraph.
  await secondUnit.locator('.unit-text').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.getByTestId('add-vocab').click();

  const vocabEntry = page.getByTestId('vocab-entry');
  await expect(vocabEntry).toHaveCount(1);
  await expect(vocabEntry).toHaveAttribute('data-source', 'selection');
  await expect(vocabEntry).toHaveAttribute('data-unit-id', unitId!);

  // 2. From a coach message — inherits that message's unit_id.
  await secondUnit.getByTestId('explain-button').click();
  await expect(page.getByTestId('turn-coach')).toHaveCount(1);
  await page.getByTestId('save-message').click();

  const chatNote = page.getByTestId('note-entry').filter({ hasText: '【解釋】' });
  await expect(chatNote).toHaveCount(1);
  await expect(chatNote).toHaveAttribute('data-source', 'chat');
  await expect(chatNote).toHaveAttribute('data-unit-id', unitId!);

  // 3. Manual — no unit_id, by design.
  await page.getByTestId('manual-term').fill('acknowledged');
  await page.getByTestId('manual-body').fill('公認的');
  await page.getByTestId('manual-submit').click();

  // Scope by source: the selection entry above captured the whole paragraph,
  // which also contains the word "acknowledged".
  const manualVocab = page.locator(
    '[data-testid="vocab-entry"][data-source="manual"]',
  );
  await expect(manualVocab).toHaveCount(1);
  await expect(manualVocab).toContainText('公認的');
  await expect(manualVocab).toHaveAttribute('data-unit-id', '');
});

test('manual notes and vocab are distinguished by the form toggle', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('import-book').click();
  await expect(page.locator('[data-unit-id]').first()).toBeVisible();

  await page.getByTestId('manual-kind-note').check();
  await page.getByTestId('manual-body').fill('記得回頭讀第一章');
  await page.getByTestId('manual-submit').click();

  await expect(page.getByTestId('note-entry')).toHaveCount(1);
  await expect(page.getByTestId('vocab-entry')).toHaveCount(0);
});
