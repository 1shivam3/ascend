import { test, expect, type Page } from '@playwright/test';
import zlib from 'node:zlib';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';

/**
 * B2 (bug program Phase 1) — keyboard covers the focused input.
 *
 * On the owner's phone the scan modal's Fine-tune / Add Item inputs
 * stayed behind the keyboard; the modal never scrolled them into
 * view. The fix is useKeyboardScrollIntoView on the scan modal
 * (src/lib/keyboard-scroll.ts): on focus it centres the field in
 * the visible area, scrolling every nested scroller.
 *
 * Headless Chromium has no software keyboard, so the keyboard is
 * simulated the way the app perceives it on the phone: the user
 * taps the field FIRST (the browser scrolls it into view against
 * the full-height layout), THEN the keyboard opens and the visible
 * viewport shrinks (interactive-widget=resizes-content) — and
 * nothing scrolls the field back into the smaller viewport. That
 * is exactly what the recordings show. The test reproduces that
 * sequence: focus, shrink to ~380px, assert the input is centred
 * back inside the visible area. Measured pre-fix: the input stays
 * at y=474 with the viewport at 380 — fully hidden.
 *
 * The field is focused via DOM focus(), not Playwright's click:
 * Playwright's own scroll-into-view loops forever against this
 * modal's nested scrollers (a harness quirk, not app behaviour).
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

test.describe('B2: focused input visible with keyboard open', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'android-360x740',
      'B2 drive runs at 360x740'
    );
    await installAiMocks(page);
    await installSeed(page, 'intermediate');
    await page.goto('/');
  });

  test('scan refine input scrolls into the visible area when the viewport shrinks', async ({
    page,
  }) => {
    const dialog = await openScanReview(page);
    const refine = dialog.locator('input[placeholder*="Rice was about" i]');

    // 1) User taps the field at full height.
    await refine.evaluate((el) => (el as HTMLInputElement).focus());
    await page.waitForTimeout(600);
    // 2) The keyboard opens: the visible viewport shrinks.
    await page.setViewportSize({ width: 360, height: 380 });
    // The hook re-centres the field on the viewport resize.
    await page.waitForTimeout(1_200);

    const box = await refine.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(380);
  });
});
