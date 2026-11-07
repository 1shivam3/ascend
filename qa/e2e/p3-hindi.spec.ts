import { test, expect, type Page } from '@playwright/test';
import { installSeed } from '../fixtures/personas';
import { shot } from '../fixtures/helpers';
import { en } from '../../src/lib/i18n/en';
import { hi } from '../../src/lib/i18n/hi';

/**
 * QA-hardening Phase 3 — Check 5 (e2e leg): Hindi persona, English
 * leakage on the main surfaces.
 *
 * Mechanical only (translation QUALITY is out of scope — the owner
 * deprioritized it 2026-11-02). A "leak" is precise: a visible text
 * run that equals an English dictionary value VERBATIM while that
 * key HAS a different Hindi value — i.e. the surface rendered the
 * English string even though a Hindi string exists. Keys whose hi
 * value intentionally equals en (units, proper nouns) are excluded
 * by construction, as are parameterized values ({...}) whose
 * rendered form interpolates.
 *
 * Surfaces: Today, Train, Progress, Fuel, You — the five bottom-nav
 * destinations with the `hindi` persona (language: 'hi').
 */

const LEAK_CANDIDATES: { key: string; enValue: string }[] = [];
for (const [key, enValue] of Object.entries(en)) {
  const hiValue = (hi as Record<string, string | undefined>)[key];
  if (hiValue === undefined || hiValue === enValue) continue;
  if (enValue.length < 14 || !enValue.includes(' ')) continue;
  if (enValue.includes('{') || enValue.includes('}')) continue;
  LEAK_CANDIDATES.push({ key, enValue });
}

async function surfaceLeaks(page: Page): Promise<string[]> {
  const text = await page.evaluate(() =>
    (document.body?.innerText ?? '').replace(/\s+/g, ' '),
  );
  return LEAK_CANDIDATES.filter(({ enValue }) =>
    text.includes(enValue.replace(/\s+/g, ' ')),
  ).map(({ key, enValue }) => `${key} = "${enValue.slice(0, 60)}"`);
}

const NAV: { tabKey: 'nav.train' | 'nav.progress' | 'nav.fuel' | 'nav.you'; id: string }[] = [
  { tabKey: 'nav.train', id: 'train' },
  { tabKey: 'nav.progress', id: 'progress' },
  { tabKey: 'nav.fuel', id: 'fuel' },
  { tabKey: 'nav.you', id: 'you' },
];

test('hindi persona: main surfaces render Hindi with no English dictionary leakage', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'android-360x740',
    'Check 5 e2e runs on the primary Android viewport',
  );
  await installSeed(page, 'hindi');
  await page.goto('/');

  // The Hindi nav itself proves the hi dictionary loaded and applied.
  // Nav buttons are scoped to the Main Navigation landmark: the bare
  // labels (e.g. आज) also appear on in-page buttons.
  const nav = page.getByRole('navigation', { name: 'Main Navigation' });
  await expect(nav.getByRole('button', { name: hi['nav.today'], exact: true })).toBeVisible({
    timeout: 20_000,
  });
  for (const key of ['nav.train', 'nav.progress', 'nav.fuel', 'nav.you'] as const) {
    await expect(nav.getByRole('button', { name: hi[key], exact: true })).toBeVisible();
  }

  const allLeaks: string[] = [];
  const scan = async (surface: string) => {
    await page.waitForTimeout(600);
    const leaks = await surfaceLeaks(page);
    for (const leak of leaks) allLeaks.push(`${surface}: ${leak}`);
    await shot(page, 'p3-hindi', surface);
  };

  await scan('today');
  for (const { tabKey, id } of NAV) {
    await nav.getByRole('button', { name: hi[tabKey], exact: true }).click();
    await page.waitForTimeout(800);
    await scan(id);
  }

  expect(allLeaks, `English leakage on Hindi surfaces:\n${allLeaks.join('\n')}`).toEqual([]);
});
