import { test, expect, type Page } from '@playwright/test';
import zlib from 'node:zlib';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';

/**
 * M1 (bug program Phase 3) — scanned macros come from the verified
 * food database, and an unverified item cannot be saved silently.
 *
 * The mocked scan returns two items with MODEL numbers:
 *  - Pineapple 200 g at 136 kcal (the gym-video value). The app's
 *    database says 50 kcal/100 g, so the review must show 100 kcal
 *    and the "Verified · Food database" source line.
 *  - "Qwzx Vbnm" 150 g — a food the database does not know. Its
 *    model numbers stay, flagged "Not verified", and the save
 *    button stays disabled until the user confirms the estimate.
 */

const M1_SCAN_MEAL = {
  mealName: 'M1 QA Plate',
  items: [
    {
      name: 'Pineapple',
      quantity: '200g',
      estimatedGrams: 200,
      calories: 136,
      proteinG: 1.1,
      carbsG: 35,
      fatG: 0.2,
      confidence: 'high',
    },
    {
      name: 'Qwzx Vbnm',
      quantity: '150g',
      estimatedGrams: 150,
      calories: 210,
      proteinG: 2,
      carbsG: 40,
      fatG: 5,
      confidence: 'high',
    },
  ],
  totalCalories: 346,
  totalProtein: 3.1,
  totalCarbs: 75,
  totalFat: 5.2,
  hiddenIngredients: [],
  confidence: 'high',
  coachingNote: 'M1 QA scan — no real model was called.',
  timestamp: '2026-01-01T00:00:00.000Z',
};

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

async function openScanReview(page: Page) {
  await page.getByRole('button', { name: /^fuel$/i }).first().click();
  await page.getByText('Scan Meal (Photo)', { exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  const gotIt = dialog.getByRole('button', { name: /got it/i });
  if (await gotIt.count()) await gotIt.first().click().catch(() => {});
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'meal.png',
    mimeType: 'image/png',
    buffer: makePngBuffer(),
  });
  await dialog.getByRole('button', { name: /analyze meal/i }).click();
  await expect(dialog.getByText('MEAL ESTIMATE')).toBeVisible({ timeout: 15_000 });
  return dialog;
}

test.describe('M1: scan verification', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'android-360x740',
      'M1 drive runs at 360x740'
    );
    await installAiMocks(page);
    // Registered after installAiMocks, so this scan payload wins.
    await page.route('**/api/ai/scan-meal', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(M1_SCAN_MEAL),
      })
    );
    await installSeed(page, 'intermediate');
    await page.goto('/');
  });

  test('database values replace model numbers; unverified items gate the save', async ({ page }) => {
    const dialog = await openScanReview(page);

    // Pineapple: DB value (100 kcal), not the model's 136.
    await expect(dialog.getByText('~100 kcal')).toBeVisible();
    await expect(dialog.getByText('Verified · Food database').first()).toBeVisible();

    // Unknown food: model numbers kept, but flagged.
    await expect(dialog.getByText('Qwzx Vbnm')).toBeVisible();
    await expect(dialog.getByText('Not verified')).toBeVisible();

    // Save is blocked until the estimate is confirmed.
    const saveBtn = dialog.getByRole('button', { name: /add to today's nutrition/i });
    await expect(saveBtn).toBeDisabled();
    await dialog.getByRole('button', { name: /confirm estimate/i }).click();
    await expect(dialog.getByText('Estimate · confirmed by you')).toBeVisible();
    await expect(saveBtn).toBeEnabled();

    await saveBtn.click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });
});
