import { test, expect, type Page } from '@playwright/test';
import zlib from 'node:zlib';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';

/**
 * B1 (bug program Phase 1) — reversed typing.
 *
 * On the owner's phone, typing into the scan review inputs put every
 * new character at the START of the field ("Salt" -> "tlaS", Gboard
 * suggestions following the reversed string). Desktop key events
 * never reproduced it (they don't compose); the mechanism is the
 * Android IME composition path meeting a parent-driven controlled
 * value. The fix is the composition-safe TextInput wrapper
 * (src/components/ui/TextInput.tsx) on the audited free-text inputs.
 *
 * This spec drives the REAL surfaces and asserts:
 *  1. character-by-character typing lands in order with the caret
 *     at the end (refine input + Add Item name input);
 *  2. an IME composition sequence driven over CDP
 *     (Input.imeSetComposition + insertText, the closest headless
 *     analogue of Gboard) also lands in order;
 *  3. the exercise search input (also migrated) types in order.
 * Real Gboard / Samsung Keyboard confirmation stays on the owner's
 * manual device checklist — it is not testable here.
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

test.describe('B1: typing order in migrated inputs', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'android-360x740',
      'B1 drive runs at 360x740'
    );
    await installAiMocks(page);
    await installSeed(page, 'intermediate');
    await page.goto('/');
  });

  test('scan refine + add-item inputs keep character order and caret', async ({ page }) => {
    const dialog = await openScanReview(page);

    // Fine-tune ("Tell AI") input.
    const refine = dialog.locator('input[placeholder*="Rice was about" i]');
    await refine.scrollIntoViewIfNeeded();
    await refine.click();
    await page.keyboard.type('Salt', { delay: 90 });
    await expect(refine).toHaveValue('Salt');
    expect(await refine.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(4);

    // IME composition over CDP: compose "Pepper" character by
    // character, committing at the end — the Gboard-shaped path.
    const cdp = await page.context().newCDPSession(page);
    await refine.click();
    await refine.fill('');
    await cdp.send('Input.imeSetComposition', {
      text: 'P',
      selectionStart: 1,
      selectionEnd: 1,
    });
    await cdp.send('Input.imeSetComposition', {
      text: 'Pe',
      selectionStart: 2,
      selectionEnd: 2,
    });
    await cdp.send('Input.insertText', { text: 'Pepper' });
    await expect(refine).toHaveValue('Pepper');

    // Add Item name input (review-step form, opened by "Add Item").
    await dialog.getByRole('button', { name: /add item/i }).click();
    const addName = dialog.locator('input[placeholder*="Curd, Salad" i]');
    await expect(addName).toBeVisible({ timeout: 10_000 });
    await addName.scrollIntoViewIfNeeded();
    await addName.click();
    await page.keyboard.type('Salt', { delay: 90 });
    await expect(addName).toHaveValue('Salt');
    expect(await addName.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(4);
  });

  test('exercise search input keeps character order', async ({ page }) => {
    await page.getByRole('button', { name: /^train$/i }).first().click();
    // Train -> Log Past Session -> Add Exercise opens the selector.
    await page.getByRole('button', { name: /log past session/i }).click();
    await page.getByRole('button', { name: /add exercise/i }).first().click();
    const search = page.locator('input[placeholder*="Search exercise" i]').first();
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.click();
    await page.keyboard.type('Bench', { delay: 90 });
    await expect(search).toHaveValue('Bench');
  });
});
