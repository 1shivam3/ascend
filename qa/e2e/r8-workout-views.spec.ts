import { test, expect } from '@playwright/test';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';
import { setTheme, shot } from '../fixtures/helpers';

/**
 * QA-hardening R8 evidence drive: both workout views.
 *
 * Seeds the intermediate persona plus an in-progress workout draft
 * (Today offers Resume), then asserts at runtime:
 *  - mid-workout: exactly ONE visible Finish entry (the secondary
 *    header button); Beginner's Complete Set bar is in the viewport
 *    without scrolling; Advanced's per-row Complete toggle is >=44px.
 *  - all sets done: the in-flow primary Finish appears and the
 *    header Finish hides — still exactly one visible Finish entry.
 * Screenshots land under qa/screenshots/r8-* per project viewport
 * (360x740 and 320x568 included) in light and dark.
 */

const today = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

function draft(allDone: boolean) {
  const setState = (done: boolean, over: Record<string, unknown> = {}) => ({
    reps: 5,
    unit: 'kg',
    ...(done ? { status: 'completed', completed: true } : { status: 'pending' }),
    ...over,
  });
  return {
    date: todayStr,
    name: 'R8 Session',
    savedAt: new Date().toISOString(),
    sessionStartTime: Date.now(),
    exercises: [
      {
        name: 'Squat',
        sets: [
          setState(true, { weight: 100 }),
          setState(allDone, { weight: 100 }),
          setState(allDone, { weight: 100 }),
        ],
      },
      {
        name: 'Push-Up',
        sets: [setState(allDone, { reps: 12 }), setState(allDone, { reps: 12 })],
      },
    ],
  };
}

async function visibleFinishCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.filter((b) => {
      const rect = b.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      const label = `${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`;
      return visible && /finish/i.test(label);
    }).length;
  });
}

async function openDraftWorkout(page: import('@playwright/test').Page, mode: 'beginner' | 'advanced', allDone: boolean, extraPrefs: Record<string, unknown> = {}) {
  await installAiMocks(page);
  await installSeed(page, 'intermediate');
  // Inject the draft + view mode through an init script (the same
  // channel installSeed uses): patchStore's write gets clobbered by
  // the app's persist-on-unload during its reload, while an init
  // script lands before the app rehydrates on every navigation.
  await page.addInitScript(
    ([draftValue, modeValue, prefs]) => {
      try {
        const raw = window.localStorage.getItem('ascend_store');
        if (!raw) return;
        const blob = JSON.parse(raw);
        blob.state.activeWorkoutDraft = draftValue;
        blob.state.uiPreferences = { ...(blob.state.uiPreferences ?? {}), workoutModeOverride: modeValue, ...(prefs as Record<string, unknown>) };
        window.localStorage.setItem('ascend_store', JSON.stringify(blob));
      } catch {}
    },
    [draft(allDone), mode, extraPrefs] as const,
  );
  await page.goto('/');
  await page.getByRole('button', { name: /resume workout/i }).first().click();
  await page.getByRole('button', { name: /^resume$/i }).first().click();
  // The workout screen header shows the live session timer + Finish.
  await expect(page.getByRole('button', { name: /finish workout/i }).first()).toBeVisible();
  await page.waitForTimeout(800); // settle mount animations before measuring
}

test.describe('R8 workout views', () => {
  test('beginner mid-workout: one Finish entry, Complete bar visible without scrolling', async ({ page }, testInfo) => {
    await openDraftWorkout(page, 'beginner', false);
    await expect.poll(() => visibleFinishCount(page), { timeout: 20_000 }).toBe(1);

    const complete = page.getByRole('button', { name: /complete set/i });
    await expect(complete).toBeVisible();
    const box = await complete.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(testInfo.project.use.viewport!.height);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    if (testInfo.project.name === 'android-360x740' || testInfo.project.name === 'small-320x568') {
      await shot(page, `r8-${testInfo.project.name}`, 'beginner-mid-light');
      await setTheme(page, 'dark');
      await shot(page, `r8-${testInfo.project.name}`, 'beginner-mid-dark');
    }
  });

  test('beginner all sets done: the single header Finish is promoted', async ({ page }, testInfo) => {
    await openDraftWorkout(page, 'beginner', true);
    await expect.poll(() => visibleFinishCount(page), { timeout: 20_000 }).toBe(1);
    // Promoted = emerald primary styling on the header Finish.
    const promoted = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        /finish/i.test(`${x.getAttribute('aria-label') ?? ''} ${x.textContent ?? ''}`)
      );
      return !!b && b.className.includes('bg-emerald-500');
    });
    expect(promoted).toBe(true);
    if (testInfo.project.name === 'android-360x740' || testInfo.project.name === 'small-320x568') {
      await shot(page, `r8-${testInfo.project.name}`, 'beginner-done-light');
      await setTheme(page, 'dark');
      await shot(page, `r8-${testInfo.project.name}`, 'beginner-done-dark');
    }
  });

  test('advanced mid-workout: one Finish entry, row toggle >= 44px', async ({ page }, testInfo) => {
    await openDraftWorkout(page, 'advanced', false);
    await expect.poll(() => visibleFinishCount(page), { timeout: 20_000 }).toBe(1);
    const toggle = page.getByRole('button', { name: /mark set complete|completed set/i }).first();
    await expect(toggle).toBeVisible();
    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    if (testInfo.project.name === 'android-360x740' || testInfo.project.name === 'small-320x568') {
      await shot(page, `r8-${testInfo.project.name}`, 'advanced-mid-light');
      await setTheme(page, 'dark');
      await shot(page, `r8-${testInfo.project.name}`, 'advanced-mid-dark');
    }
  });

  test('advanced XL text at small viewport: first set row actions visible', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'small-320x568', 'XL-text visibility check runs on the small viewport');
    await openDraftWorkout(page, 'advanced', false, { textScale: 'xlarge' });
    const toggle = page.getByRole('button', { name: /mark set complete|completed set/i }).first();
    await expect(toggle).toBeVisible();
    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(testInfo.project.use.viewport!.height);
    await shot(page, 'r8-small-320x568', 'advanced-xl-light');
  });
});
