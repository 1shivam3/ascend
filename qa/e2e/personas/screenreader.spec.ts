import { test, expect } from '@playwright/test';
import { installSeed } from '../../fixtures/personas';
import { installAiMocks } from '../../fixtures/ai-mocks';
import { PersonaRun, expectBooted, mainNav } from '../../fixtures/persona-run';

/**
 * Phase 4 — Persona 10: Screen-reader user.
 *
 * METHOD, stated plainly: this persona reads Playwright's
 * accessibility snapshot — the Chromium accessibility tree, the
 * same tree TalkBack/VoiceOver consume — and drives by role and
 * accessible name only. It is NOT a real screen reader, not a
 * real device, and not a substitute for either; it catches
 * unnamed/unreachable controls and broken focus order, which are
 * the failures that make a screen-reader journey impossible.
 *
 * A surface FAILS its step if any interactive node (button, link,
 * textbox, tab, switch, checkbox, combobox, slider, menuitem,
 * radio) has an empty accessible name.
 */

/**
 * Playwright 1.65 removed page.accessibility.snapshot(); the
 * supported surface is locator.ariaSnapshot(), which renders the
 * same Chromium accessibility tree as indented YAML lines:
 *   - button "Start Workout"
 *   - button            <- no name: a screen-reader dead end
 * Parsing is line-based; indentation marks the subtree, which the
 * dialog check uses to scope its analysis.
 */
const INTERACTIVE = new Set([
  'button',
  'link',
  'textbox',
  'tab',
  'switch',
  'checkbox',
  'combobox',
  'slider',
  'menuitem',
  'radio',
  'searchbox',
  'spinbutton',
]);

interface ALine {
  indent: number;
  role: string;
  name: string | null;
  raw: string;
}

function parseAria(yaml: string): ALine[] {
  const out: ALine[] = [];
  for (const raw of yaml.split('\n')) {
    const m = raw.match(/^(\s*)- ([a-z]+)(?:\s+"([^"]*)")?/);
    if (!m) continue;
    out.push({ indent: m[1].length, role: m[2], name: m[3] ?? null, raw });
  }
  return out;
}

function analyzeLines(lines: ALine[]): { total: number; unnamed: string[] } {
  let total = 0;
  const unnamed: string[] = [];
  for (const line of lines) {
    if (!INTERACTIVE.has(line.role)) continue;
    total += 1;
    if (!line.name || line.name.trim() === '') unnamed.push(line.role);
  }
  return { total, unnamed };
}

async function ariaLines(page: import('@playwright/test').Page): Promise<ALine[]> {
  return parseAria(await page.locator('body').ariaSnapshot());
}

function analyze(lines: ALine[]): { total: number; unnamed: string[] } {
  return analyzeLines(lines);
}

async function surfaceStep(
  run: PersonaRun,
  page: import('@playwright/test').Page,
  label: string,
  shotName?: string,
  go?: () => Promise<void>,
): Promise<void> {
  await run.step(label, async () => {
    if (go) await go();
    await page.waitForTimeout(900);
    const snap = await ariaLines(page);
    const { total, unnamed } = analyze(snap);
    expect(total).toBeGreaterThan(0);
    if (unnamed.length > 0) {
      throw new Error(`${unnamed.length} of ${total} interactive elements have NO accessible name (${unnamed.join(', ')})`);
    }
  });
  if (shotName) await run.shotAt(shotName).catch(() => {});
}

test('Screen-reader — accessibility tree across surfaces', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(420_000);
  const run = new PersonaRun(page, 'screenreader');
  await installAiMocks(page);
  await installSeed(page, 'intermediate');

  await page.goto('/');
  await expectBooted(page);

  await surfaceStep(run, page, 'Today: every interactive element is named', 'today-light');
  await run.shotsBoth('today');

  await surfaceStep(run, page, 'Train landing: every interactive element is named', undefined, async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^train$/i }));
  });

  await run.step('Plan-generator dialog: present in the tree, named, focus inside', async () => {
    await run.tap(page.getByRole('button', { name: /^suggested workout$/i }).first());
    await page.waitForTimeout(1_200);
    const lines = await ariaLines(page);
    const dlgIdx = lines.findIndex((l) => l.role === 'dialog' || l.role === 'alertdialog');
    expect(dlgIdx).toBeGreaterThanOrEqual(0);
    const dlgIndent = lines[dlgIdx].indent;
    const subtree: ALine[] = [];
    for (let i = dlgIdx + 1; i < lines.length && lines[i].indent > dlgIndent; i++) subtree.push(lines[i]);
    expect(lines[dlgIdx].name, 'dialog itself must have an accessible name').toBeTruthy();
    const focusInside = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return Boolean(dlg && document.activeElement && dlg.contains(document.activeElement));
    });
    expect(focusInside).toBe(true);
    const { unnamed } = analyzeLines(subtree);
    if (unnamed.length > 0) {
      throw new Error(`${unnamed.length} unnamed interactive elements inside the dialog (${unnamed.join(', ')})`);
    }
  });
  await run.shotAt('generator-dialog-light');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  await run.step('Live workout session: every interactive element is named', async () => {
    await run.tap(page.getByRole('button', { name: /^suggested workout$/i }).first());
    await expect(page.getByRole('button', { name: /^start workout$/i }).last()).toBeVisible();
    await run.tap(page.getByRole('button', { name: /^start workout$/i }).last());
    await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible({ timeout: 20_000 });
    const snap = await ariaLines(page);
    const { total, unnamed } = analyze(snap);
    expect(total).toBeGreaterThan(0);
    if (unnamed.length > 0) {
      throw new Error(`${unnamed.length} of ${total} interactive elements have NO accessible name (${unnamed.join(', ')})`);
    }
  });
  await run.shotAt('session-light').catch(() => {});
  // Restart the app to leave the session (the session layer owns
  // the screen; a restart is also what a screen-reader user does
  // when a full-screen flow has no obvious exit). The seed
  // re-applies; nothing in this persona depends on the draft.
  await page.reload({ waitUntil: 'load' });
  await expectBooted(page);

  await surfaceStep(run, page, 'Fuel: every interactive element is named', undefined, async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^fuel$/i }));
  });

  await surfaceStep(run, page, 'Progress: every interactive element is named', 'progress-light', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^progress$/i }));
  });

  await surfaceStep(run, page, 'You / Profile: every interactive element is named', undefined, async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^you$/i }));
  });

  run.logSummary();
});

test('Screen-reader — keyboard focus order + live regions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(240_000);
  const run = new PersonaRun(page, 'screenreader');
  await installAiMocks(page);
  await installSeed(page, 'intermediate');

  await page.goto('/');
  await expectBooted(page);

  await run.step('Keyboard Tab order on Today is sane and fully named', async () => {
    const stops: string[] = [];
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press('Tab');
      run.taps += 1;
      await page.waitForTimeout(120);
      const name = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return '(body)';
        return (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40);
      });
      stops.push(name);
    }
    // No stop may be an unnamed element, and the main navigation
    // must be reachable within the first screen of stops.
    const unnamedStops = stops.filter((s) => s === '' || s === '(body)');
    expect(unnamedStops.length).toBe(0);
    const joined = stops.join(' | ');
    expect(joined).toMatch(/train|start workout|today/i);
  });

  await run.step('Live regions exist for announcements (toasts / status)', async () => {
    const regions = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-live]')).map((el) => ({
        live: el.getAttribute('aria-live'),
        role: el.getAttribute('role') ?? el.tagName,
      })),
    );
    expect(regions.length).toBeGreaterThanOrEqual(1);
  });

  run.logSummary();
});
