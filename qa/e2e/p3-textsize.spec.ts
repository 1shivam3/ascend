import { test, expect, type Page } from '@playwright/test';
import zlib from 'node:zlib';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';
import { setTheme, shot } from '../fixtures/helpers';

/**
 * QA-hardening Phase 3 — Check 4: Large / Extra Large text clipping.
 *
 * The brief's 8 screens: Today, Active workout (Beginner view),
 * Active workout (Advanced view), Generator, Fuel Today, Settings,
 * Reminder Center, Form Coach, Meal Scan result. (Active workout
 * counts once with both views driven — 9 drives.)
 *
 * Matrix: text sizes Large + Extra Large, widths 360x740
 * (android-360x740 project) and 320x568 (small-320x568 project),
 * light AND dark (dark via the Phase 3-fixed helpers.setTheme,
 * which asserts data-theme before returning).
 *
 * Assertions per combo:
 *  - the document never overflows horizontally;
 *  - no visible interactive element (button / link / tab) has its
 *    own label clipped (scrollWidth beyond its box) unless the full
 *    label is still exposed via aria-label or title.
 * Screenshots per combo land in qa/screenshots/p3-textsize/.
 */

test.setTimeout(300_000);

type TextScale = 'large' | 'xlarge';
const SIZES: TextScale[] = ['large', 'xlarge'];

/** Patches uiPreferences through an init script — the channel that
 *  survives the app's persist-on-unload (the R8/R14 pattern). */
async function applyTextScale(page: Page, scale: TextScale) {
  await page.addInitScript((s) => {
    try {
      const raw = window.localStorage.getItem('ascend_store');
      if (!raw) return;
      const blob = JSON.parse(raw);
      blob.state.uiPreferences = { ...(blob.state.uiPreferences ?? {}), textScale: s };
      window.localStorage.setItem('ascend_store', JSON.stringify(blob));
    } catch {}
  }, scale);
}

interface ClipReport {
  docOverflow: number;
  clipped: { text: string; sw: number; cw: number }[];
}

async function clipReport(page: Page): Promise<ClipReport> {
  return page.evaluate(() => {
    const docOverflow =
      document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const clipped: { text: string; sw: number; cw: number }[] = [];
    const els = Array.from(
      document.querySelectorAll<HTMLElement>('button, a, [role="button"], [role="tab"]'),
    );
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Visually-hidden accessibility utilities (the "Skip to main
      // content" link is 1px wide until focused) are not rendered
      // labels — never count them as clipped.
      if (rect.width <= 2 || rect.height <= 2) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (el.scrollWidth > el.clientWidth + 2) {
        const label = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        const aria = el.getAttribute('aria-label') || '';
        const title = el.getAttribute('title') || '';
        // Rescued when the full label survives on an accessible name
        // or tooltip at least as long as the visible text.
        if (aria.length >= label.length || title.length >= label.length) continue;
        // Visible-spill rescue: with overflow-x visible the label is
        // PAINTED outside its box, not clipped. When the painted text
        // overhangs the border box by only a few px the word stays
        // fully legible — not a clipped label. (Check 4 finding F3-2:
        // the Graphite theme pill measures sw 70 vs cw 67 at
        // xlarge/320; its text overhangs ~2.5px and the screenshot
        // shows the word complete. Larger spills still fail.)
        if (style.overflowX === 'visible' && el.childNodes.length > 0) {
          const range = document.createRange();
          range.selectNodeContents(el);
          const tr = range.getBoundingClientRect();
          if (tr.width > 0) {
            const overhang = Math.max(rect.left - tr.left, tr.right - rect.right);
            if (overhang <= 4) continue;
          }
        }
        clipped.push({ text: label.slice(0, 48), sw: el.scrollWidth, cw: el.clientWidth });
      }
    }
    return { docOverflow, clipped: clipped.slice(0, 12) };
  });
}

async function assertNoClipping(page: Page, label: string) {
  const report = await clipReport(page);
  expect(report.docOverflow, `${label}: horizontal document overflow`).toBeLessThanOrEqual(1);
  expect(report.clipped, `${label}: clipped interactive labels`).toEqual([]);
}

// ── Screen drives (each works from a cold landing, so it can be
//    re-run after setTheme's reload) ───────────────────────────────

async function driveToday(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible({
    timeout: 20_000,
  });
}

async function driveWorkout(page: Page) {
  await page.getByRole('button', { name: /resume workout/i }).first().click();
  await page.getByRole('button', { name: /^resume$/i }).first().click();
  await expect(page.getByRole('button', { name: /finish workout/i }).first()).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(800);
}

async function driveGenerator(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^train$/i }).first().click();
  await page.getByRole('button', { name: /suggest one for me/i }).click();
  await expect(page.getByText('Workout Plan Generator')).toBeVisible({ timeout: 20_000 });
}

async function driveFuel(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^fuel$/i }).first().click();
  await expect(page.getByText('Scan Meal (Photo)', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
}

async function driveSettings(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^you$/i }).first().click();
  await page.getByRole('button', { name: /^settings$/i }).first().click();
  await expect(page.getByText('Text Size')).toBeVisible({ timeout: 20_000 });
}

async function driveReminders(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Notifications' }),
  ).toBeVisible({ timeout: 20_000 });
}

async function driveFormCoach(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^train$/i }).first().click();
  await page.getByRole('button', { name: 'Training Tools' }).click();
  await page.getByText('Form Coach', { exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 });
}

/** Minimal valid PNG (see p3-scan-trust.spec.ts). */
function makePngBuffer(): Buffer {
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(120, 0);
  ihdr.writeUInt32BE(120, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(120 * 3, 200)]);
  const raw = Buffer.concat(Array.from({ length: 120 }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function driveScanResult(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^fuel$/i }).first().click();
  await page.getByText('Scan Meal (Photo)', { exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'meal.png',
    mimeType: 'image/png',
    buffer: makePngBuffer(),
  });
  await dialog.getByRole('button', { name: /analyze meal/i }).click();
  await expect(dialog.getByText('MEAL ESTIMATE')).toBeVisible({ timeout: 20_000 });
}

// Workout draft (the R8 spec's shape): Squat mid-session + Push-Up.
function workoutDraft() {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const setState = (done: boolean, over: Record<string, unknown> = {}) => ({
    reps: 5,
    unit: 'kg',
    ...(done ? { status: 'completed', completed: true } : { status: 'pending' }),
    ...over,
  });
  return {
    date: todayStr,
    name: 'P3 Session',
    savedAt: new Date().toISOString(),
    sessionStartTime: Date.now(),
    exercises: [
      {
        name: 'Squat',
        sets: [setState(true, { weight: 100 }), setState(false, { weight: 100 }), setState(false, { weight: 100 })],
      },
      { name: 'Push-Up', sets: [setState(false, { reps: 12 }), setState(false, { reps: 12 })] },
    ],
  };
}

async function applyWorkoutDraft(page: Page, mode: 'beginner' | 'advanced') {
  await page.addInitScript(
    ([draftValue, modeValue]) => {
      try {
        const raw = window.localStorage.getItem('ascend_store');
        if (!raw) return;
        const blob = JSON.parse(raw);
        blob.state.activeWorkoutDraft = draftValue;
        blob.state.uiPreferences = {
          ...(blob.state.uiPreferences ?? {}),
          workoutModeOverride: modeValue,
        };
        window.localStorage.setItem('ascend_store', JSON.stringify(blob));
      } catch {}
    },
    [workoutDraft(), mode] as const,
  );
}

// ── The matrix ────────────────────────────────────────────────────

interface ScreenDef {
  id: string;
  setup?: (page: Page) => Promise<void>;
  drive: (page: Page) => Promise<void>;
}

const SCREENS: ScreenDef[] = [
  { id: 'today', drive: driveToday },
  {
    id: 'workout-beginner',
    setup: (p) => applyWorkoutDraft(p, 'beginner'),
    drive: async (p) => {
      await p.goto('/');
      await driveWorkout(p);
    },
  },
  {
    id: 'workout-advanced',
    setup: (p) => applyWorkoutDraft(p, 'advanced'),
    drive: async (p) => {
      await p.goto('/');
      await driveWorkout(p);
    },
  },
  { id: 'generator', drive: driveGenerator },
  { id: 'fuel', drive: driveFuel },
  { id: 'settings', drive: driveSettings },
  { id: 'reminders', drive: driveReminders },
  { id: 'form-coach', drive: driveFormCoach },
  { id: 'scan-result', drive: driveScanResult },
];

for (const screen of SCREENS) {
  for (const size of SIZES) {
    test(`text size ${size}: ${screen.id}`, async ({ page }, testInfo) => {
      const proj = testInfo.project.name;
      test.skip(
        proj !== 'android-360x740' && proj !== 'small-320x568',
        'Check 4 runs at 360x740 and 320x568',
      );
      await installAiMocks(page);
      await installSeed(page, 'intermediate');
      await applyTextScale(page, size);
      if (screen.setup) await screen.setup(page);

      // Light pass.
      await screen.drive(page);
      await assertNoClipping(page, `${screen.id}/${size}/${proj}/light`);
      await shot(page, 'p3-textsize', `${screen.id}-${size}-${proj}-light`);

      // Dark pass — setTheme reloads; re-drive from the cold landing.
      await setTheme(page, 'dark');
      await screen.drive(page);
      await assertNoClipping(page, `${screen.id}/${size}/${proj}/dark`);
      await shot(page, 'p3-textsize', `${screen.id}-${size}-${proj}-dark`);
    });
  }
}
