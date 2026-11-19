import { test, expect, type Page } from '@playwright/test';
import zlib from 'node:zlib';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';

/**
 * B3 (bug program Phase 1) — the full scan-correction journey,
 * end to end with mocked AI (no real model is called):
 *
 *   review -> rename an item + change its portion -> remove an
 *   item -> add an item (name + grams) -> Refine with a grams note
 *   (the modal's local DB path) -> Save -> the meal lands in
 *   today's list with exactly the corrected items.
 *
 * The mock scan returns Toor Dal (Pigeon Pea) 150 g and Roti 60 g
 * (qa/fixtures/ai-mocks.ts MOCK_SCAN_MEAL).
 */

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

test.describe('B3: scan-correction journey', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'android-360x740',
      'B3 drive runs at 360x740'
    );
    await installAiMocks(page);
    await installSeed(page, 'intermediate');
    await page.goto('/');
  });

  test('rename, re-portion, remove, add, refine, save — the saved meal matches the corrections', async ({
    page,
  }) => {
    const dialog = await openScanReview(page);
    await expect(dialog.getByText('Toor Dal (Pigeon Pea)')).toBeVisible();
    await expect(dialog.getByText('Roti', { exact: true })).toBeVisible();

    // 1) Rename item 0 + change its portion to 200 g.
    await dialog.locator('button[title="Edit Portion or Macros"]').first().click();
    await dialog.locator('#scan-edit-name-0').fill('Toor Dal Tadka');
    await dialog.locator('#scan-edit-grams-0').fill('200');
    await dialog.getByRole('button', { name: /save changes/i }).click();
    await expect(dialog.getByText('Toor Dal Tadka')).toBeVisible();

    // 2) Remove the Roti (second item's remove button).
    await dialog.locator('button[title="Remove Food"]').nth(1).click();
    await expect(dialog.getByText('DETECTED FOODS (1)')).toBeVisible();

    // 3) Add Curd, 100 g.
    await dialog.getByRole('button', { name: /add item/i }).click();
    const addName = dialog.locator('input[placeholder*="Curd, Salad" i]');
    await expect(addName).toBeVisible({ timeout: 10_000 });
    await addName.fill('Curd');
    await dialog.locator('input[type="number"]:visible').first().fill('100');
    await dialog.getByRole('button', { name: /^add$/i }).click();
    await expect(dialog.getByText('DETECTED FOODS (2)')).toBeVisible();
    await expect(dialog.getByText('Curd', { exact: true })).toBeVisible();

    // 4) Refine: "Curd 150g" takes the modal's local path (item
    // first word + grams) and re-estimates from the offline DB.
    const refine = dialog.locator('input[placeholder*="Rice was about" i]');
    await refine.scrollIntoViewIfNeeded();
    await refine.fill('Curd 150g');
    await dialog.getByRole('button', { name: /^refine$/i }).click();
    await expect(dialog.getByText(/150\s*g/).first()).toBeVisible({ timeout: 10_000 });

    // 5) Save — the meal lands in today's list with the corrections.
    // Verified against the persisted store (the source of truth the
    // list renders from): exactly the corrected items, no Roti.
    await dialog.getByRole('button', { name: /add to today's nutrition/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    type SavedFood = { name: string; quantity: number; unit: string; calories: number };
    const savedFoods = await page.evaluate((): SavedFood[] | null => {
      const raw = window.localStorage.getItem('ascend_store');
      if (!raw) return null;
      const meals = JSON.parse(raw)?.state?.meals ?? [];
      const mine = meals.find((m: { name?: string }) => m.name === 'QA Mock Thali');
      return (mine?.foods ?? []).map(
        (f: { name: string; quantity: number; unit: string; calories: number }) => ({
          name: f.name,
          quantity: f.quantity,
          unit: f.unit,
          calories: f.calories,
        })
      );
    });
    expect(savedFoods).not.toBeNull();
    expect(savedFoods!.map((f: SavedFood) => f.name)).toEqual(['Toor Dal Tadka', 'Curd']);
    // Portions save as household-unit drafts where they map cleanly
    // (the dal's 200 g lands as a katori draft), so the portion
    // evidence is the calorie total: 220 (dal at 200 g) + ~92 (curd
    // refined to 150 g from the offline DB) = the 312 kcal the
    // "Meal Logged" toast reported.
    const total = Math.round(savedFoods!.reduce((s: number, f: SavedFood) => s + f.calories, 0));
    expect(total).toBe(312);
  });
});
