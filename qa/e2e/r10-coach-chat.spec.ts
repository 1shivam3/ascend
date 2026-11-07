import { test, expect } from '@playwright/test';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';
import { setTheme, shot } from '../fixtures/helpers';

/**
 * QA-hardening R10 evidence drive: coach chat layout at 360x740.
 *
 * Uses a long-reply mock (registered after the harness mocks, so it
 * wins) carrying a macro-goals action, then asserts the layout
 * contract: the thread is the single scroll region and uses the
 * section's available height, the newest content is auto-scrolled
 * into view, the action card is fully visible, and the input row
 * sits pinned at the section's bottom inside the viewport.
 * Keyboard-open behavior cannot be emulated in this harness and is
 * NOT asserted here (reported as not-testable-here).
 */

const LONG_REPLY = [
  'Strong week — your squat top set moved up and the deadlift volume held steady across all three sessions.',
  'Here is the longer read: your readiness trend is stable, sleep scores are fine, and the only limiter right now is protein landing short on training days. The session plan does not need to change; the fuel around it does.',
  'I am proposing a protein bump on the card below. Nothing changes until you tap Apply — the card shows the exact diff first, and you can undo it afterwards from the same thread.',
  'Next session, keep the top set honest: if the last rep slows down, stop there rather than grinding. Add load only when every rep is clean at the current weight.',
].join('\n\n');

test('coach chat: single scroll thread, pinned input, action card fully visible', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'canonical R10 drive runs at 360x740');
  await installAiMocks(page);
  // Long-reply override (registered later wins over the harness mock).
  await page.route('**/api/ai/coach-chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: LONG_REPLY,
        evidence: ['Squat best estimated 1RM 120 kg (your logged lifts)'],
        provider: 'qa-mock',
        model: 'qa-mock',
        safetyStop: null,
        dailyRemaining: 41,
        action: { type: 'set_macro_goals', proteinG: 170 },
      }),
    });
  });
  await installSeed(page, 'intermediate');
  await page.goto('/');

  await page.getByRole('button', { name: /^train$/i }).first().click();
  await page.getByRole('tab', { name: /^coach$/i }).first().click();
  await page.getByRole('button', { name: /ask the coach/i }).click();

  const section = page.locator('section[aria-label="Coach chat"]');
  await expect(section).toBeVisible();
  const input = section.getByLabel(/ask about your training/i);
  const send = section.getByRole('button', { name: /^send$/i });

  await input.fill('How is my week going?');
  await send.click();
  await expect(section.getByRole('button', { name: /^apply$/i })).toBeVisible({ timeout: 15_000 });

  await input.fill('And what should I change?');
  await send.click();
  // A second identical pending action SUPERSEDES the first (the coach
  // action system's supersede-per-type rule): exactly one Apply card
  // exists — the newest, at the bottom of the thread.
  await expect(section.getByRole('button', { name: /^apply$/i })).toHaveCount(1, { timeout: 15_000 });
  await page.waitForTimeout(600); // let the stick-scroll settle

  const metrics = await page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="Coach chat"]')!;
    const thread = sec.querySelector('.overflow-y-auto') as HTMLElement;
    const inputEl = sec.querySelector('input');
    const secRect = sec.getBoundingClientRect();
    const threadRect = thread.getBoundingClientRect();
    const inputRect = inputEl!.getBoundingClientRect();
    const cards = Array.from(sec.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Apply');
    const lastCard = cards[cards.length - 1]!.closest('div[class*="rounded"]') as HTMLElement | null;
    const lastCardRect = lastCard?.getBoundingClientRect();
    return {
      sectionHeight: secRect.height,
      threadClientHeight: thread.clientHeight,
      threadScrollHeight: thread.scrollHeight,
      threadScrollTop: thread.scrollTop,
      inputBottom: inputRect.bottom,
      sectionBottom: secRect.bottom,
      viewportH: window.innerHeight,
      lastCardBottom: lastCardRect?.bottom ?? null,
      threadBottom: threadRect.bottom,
    };
  });

  // Thread uses the bounded section height and is the scroll region.
  expect(metrics.threadScrollHeight).toBeGreaterThan(metrics.threadClientHeight);
  expect(metrics.sectionHeight).toBeLessThanOrEqual(Math.round(0.78 * metrics.viewportH) + 24);
  // Auto-scroll: the thread is scrolled to (near) the bottom.
  expect(metrics.threadScrollTop).toBeGreaterThan(metrics.threadScrollHeight - metrics.threadClientHeight - 48);
  // The newest action card is fully inside the thread's visible box.
  expect(metrics.lastCardBottom).not.toBeNull();
  expect(metrics.lastCardBottom!).toBeLessThanOrEqual(metrics.threadBottom + 2);
  // Input pinned at the section bottom, inside the viewport.
  expect(Math.abs(metrics.inputBottom - metrics.sectionBottom)).toBeLessThan(40);
  expect(metrics.inputBottom).toBeLessThanOrEqual(metrics.viewportH);

  await shot(page, 'r10-360x740', 'coach-chat-light');
  await setTheme(page, 'dark');
  await shot(page, 'r10-360x740', 'coach-chat-dark');
});
