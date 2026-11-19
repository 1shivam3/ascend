import { test, expect } from '@playwright/test';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';

/**
 * T3 (bug program Phase 4): a persisted thread spanning days renders
 * day separators, collapses a settled action card from a previous
 * day behind one line, and offers a two-tap "New chat". The chat
 * store is seeded directly (its real persisted shape); stored
 * messages are never rewritten — this is display behaviour only.
 */

const DAY_MS = 86_400_000;

test('stale thread: separators, collapsed old card, new chat clears', async ({ page }) => {
  const now = Date.now();
  const oldTs = now - 10 * DAY_MS;
  const oldDate = new Date(oldTs);
  const oldDayLabel = oldDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  await page.addInitScript(
    ({ oldTs, nowTs }) => {
      const goals = { calories: 2600, proteinG: 160, carbsG: 300, fatG: 70 };
      const messages = [
        { role: 'user', content: 'Please raise my protein', ts: oldTs },
        {
          role: 'assistant',
          content: 'Done — protein is up.',
          ts: oldTs + 60_000,
          action: { type: 'set_macro_goals', proteinG: 170 },
          actionState: 'applied',
          appliedSnapshot: {
            previous: goals,
            applied: { ...goals, proteinG: 170 },
          },
        },
        { role: 'user', content: 'Thanks coach', ts: nowTs },
      ];
      localStorage.setItem(
        'ascend_coach_chat_v1',
        JSON.stringify({ state: { messages, dailyLeft: null, dailyLeftDate: null }, version: 0 })
      );
    },
    { oldTs, nowTs: now }
  );

  await installAiMocks(page);
  await installSeed(page, 'intermediate');
  await page.goto('/');

  await page.getByRole('button', { name: /^train$/i }).first().click();
  await page.getByRole('tab', { name: /^coach$/i }).first().click();
  await page.getByRole('button', { name: /ask the coach/i }).click();

  const section = page.locator('section[aria-label="Coach chat"]');
  await expect(section).toBeVisible();

  // The old day is labelled with its date; today is labelled Today.
  await expect(section.getByText(oldDayLabel, { exact: true })).toBeVisible();
  await expect(section.getByText('Today', { exact: true })).toBeVisible();

  // The settled card from 10 days ago is collapsed to one line; its
  // receipt ("Targets updated") is not dumped into the thread.
  await expect(section.getByText(/Action from .* — settled/)).toBeVisible();
  await expect(section.getByText('Targets updated')).toHaveCount(0);

  // Expanding shows the real card.
  await section.getByRole('button', { name: 'Show details' }).click();
  await expect(section.getByText('Targets updated')).toBeVisible();

  // New chat: first tap arms, second tap clears the thread.
  await section.getByRole('button', { name: 'New chat' }).click();
  await section.getByRole('button', { name: 'Tap again to clear this chat' }).click();
  await expect(section.getByText('Please raise my protein')).toHaveCount(0);
  await expect(section.getByText('Thanks coach')).toHaveCount(0);
});
