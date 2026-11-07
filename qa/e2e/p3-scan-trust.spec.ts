import { test, expect, type Page } from '@playwright/test';
import zlib from 'node:zlib';
import { installSeed } from '../fixtures/personas';
import { installAiMocks, MOCK_SCAN_MEAL } from '../fixtures/ai-mocks';
import { shot } from '../fixtures/helpers';

/**
 * QA-hardening Phase 3 — Check 1: meal-scan trust, live drive.
 *
 * Drives the real scan flow (Fuel → Scan Meal (Photo) → upload →
 * analyzing → review) against the harness AI mocks and asserts the
 * audit Phase 3 trust contract on the RENDERED surface:
 *
 *  Test A (standard fixture, response delayed so the analyzing step
 *  is observable): the user's photo thumbnail stays visible while
 *  analyzing; the review pins the "Estimated" badge and the meal
 *  total; the overall confidence line shows the COMPUTED level.
 *
 *  Test B (route-shaped payload, lying confidence fields): the
 *  payload is what /api/ai/scan-meal emits AFTER the route's
 *  sanitize + stamp pass for a scan whose model mislabeled pigeon
 *  pea — canonical name "Toor Dal (Pigeon Pea)" — but its
 *  confidence fields still claim 'high' and one item is physically
 *  impossible (4,000 kcal in 10 g). The review must show the
 *  canonical name, no "Chana" anywhere in the dialog, and an
 *  overall Low — the modal's own computed weakest-item level, not
 *  the payload's claim.
 *
 *  Layer note (Phase 3 finding F3-1): name canonicalization lives
 *  ONLY in the server route; the client renders item names
 *  verbatim. A first version of Test B fed the RAW model payload
 *  (name "Cooked Pigeon Peas (Chana)") straight to the client and
 *  the mislabel rendered — see
 *  qa/screenshots/p3-scan-trust/finding-raw-model-payload.png.
 *  Production responses always pass the route's sanitizer, so the
 *  mislabel cannot reach the UI today; the gap is single-layer
 *  enforcement, recorded as a finding rather than fixed here.
 */

/** Minimal valid PNG (120x120 solid) — enough for the app's canvas
 *  image pipeline (validate → resize → JPEG). */
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(120 * 3, 200)]);
  const raw = Buffer.concat(Array.from({ length: 120 }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function openScanAndUpload(page: Page) {
  await page.getByRole('button', { name: /^fuel$/i }).first().click();
  await page.getByText('Scan Meal (Photo)', { exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Scan Meal', { exact: true })).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'meal.png',
    mimeType: 'image/png',
    buffer: makePngBuffer(),
  });
  // Preview + analyze CTA appear once the image pipeline finishes.
  await expect(dialog.getByRole('button', { name: /analyze meal/i })).toBeVisible({
    timeout: 15_000,
  });
  return dialog;
}

test.describe('Phase 3 check 1: meal-scan trust', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'android-360x740',
      'Phase 3 scan drive runs at 360x740',
    );
    await installAiMocks(page);
    await installSeed(page, 'intermediate');
  });

  test('A: thumbnail while analyzing; Estimated badge, total, computed High in review', async ({
    page,
  }) => {
    // Delay ONLY the scan response so the analyzing step is
    // observable (registered after the harness mocks, so it wins —
    // the r10 spec's pattern).
    await page.route('**/api/ai/scan-meal', async (route) => {
      await new Promise((r) => setTimeout(r, 2_500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SCAN_MEAL),
      });
    });
    await page.goto('/');
    const dialog = await openScanAndUpload(page);
    await dialog.getByRole('button', { name: /analyze meal/i }).click();

    // Analyzing: the user's own photo thumbnail + the analyzing copy.
    await expect(dialog.getByText('Analyzing Food & Portions...')).toBeVisible();
    await expect(dialog.locator('img[alt="Meal preview"]')).toBeVisible();

    // Review: pinned summary — Estimated badge, total, computed label.
    await expect(dialog.getByText('MEAL ESTIMATE')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText('Estimated', { exact: true })).toBeVisible();
    await expect(dialog.getByText('~405')).toBeVisible();
    await expect(dialog.getByText(/Overall estimate confidence: High confidence/)).toBeVisible();
    await expect(dialog.getByText('Toor Dal (Pigeon Pea)')).toBeVisible();
    await expect(dialog.getByText('Roti', { exact: true })).toBeVisible();
    await shot(page, 'p3-scan-trust', 'review-high-light');
  });

  test('B: route-shaped payload — canonical name shown; computed Low beats claimed high', async ({
    page,
  }) => {
    await page.route('**/api/ai/scan-meal', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mealName: 'QA Lying Payload',
          items: [
            {
              // The route's sanitizer emits this canonical name for
              // the model's "Cooked Pigeon Peas (Chana)" mislabel.
              name: 'Toor Dal (Pigeon Pea)',
              quantity: '1 katori',
              estimatedGrams: 150,
              calories: 165,
              proteinG: 9,
              carbsG: 22,
              fatG: 4.5,
              confidence: 'high',
            },
            {
              // Physically impossible density: 4,000 kcal in 10 g.
              name: 'Roti',
              quantity: '1 piece',
              estimatedGrams: 10,
              calories: 4000,
              proteinG: 7,
              carbsG: 48,
              fatG: 3,
              confidence: 'high',
            },
          ],
          totalCalories: 4165,
          totalProtein: 16,
          totalCarbs: 70,
          totalFat: 7.5,
          hiddenIngredients: [],
          confidence: 'high',
          coachingNote: 'QA mock: the model claims high confidence.',
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
      });
    });
    await page.goto('/');
    const dialog = await openScanAndUpload(page);
    await dialog.getByRole('button', { name: /analyze meal/i }).click();

    await expect(dialog.getByText('MEAL ESTIMATE')).toBeVisible({ timeout: 15_000 });
    // The mislabel is corrected to the honest canonical name…
    await expect(dialog.getByText('Toor Dal (Pigeon Pea)')).toBeVisible();
    // …and "Chana" appears nowhere in the dialog.
    await expect(dialog.getByText(/chana/i)).toHaveCount(0);
    // The model's 'high' is discarded: the impossible item makes
    // the computed meal level Low.
    await expect(dialog.getByText(/Overall estimate confidence: Low confidence/)).toBeVisible();
    await expect(dialog.getByText('Estimated', { exact: true })).toBeVisible();
    await shot(page, 'p3-scan-trust', 'review-low-alias-light');
  });
});
