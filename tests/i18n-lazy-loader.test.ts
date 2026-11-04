/**
 * PERF-2 lazy Hindi dictionary loader.
 *
 * The Hindi dictionary (~65 KB gzip) used to be statically imported by
 * the i18n module, so it rode in the initial bundle of every session —
 * including English ones. It now loads on demand. These tests run
 * against a FRESH module instance (vi.resetModules) so the registry
 * starts empty, unlike the rest of the suite where tests/setup-i18n.ts
 * reproduces the production boot guarantee by seeding it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type I18nModule = typeof import('../src/lib/i18n');

async function freshI18n(): Promise<I18nModule> {
  vi.resetModules();
  return import('../src/lib/i18n');
}

beforeEach(() => {
  vi.resetModules();
});

describe('lazy Hindi dictionary (PERF-2)', () => {
  it('starts unloaded: Hindi lookups degrade to English, never a raw key', async () => {
    const i18n = await freshI18n();
    expect(i18n.getHiDictionary()).toBeNull();
    expect(i18n.isHiDictionarySettled()).toBe(false);
    expect(i18n.translate('hi', 'common.save')).toBe('Save');
    expect(i18n.translate('en', 'common.save')).toBe('Save');
  });

  it('loads the real dictionary on demand and resolves Hindi copy', async () => {
    const i18n = await freshI18n();
    const dict = await i18n.loadHiDictionary();
    expect(dict).not.toBeNull();
    expect(dict?.['common.save']).toBe('सेव करें');
    expect(i18n.getHiDictionary()).toBe(dict);
    expect(i18n.isHiDictionarySettled()).toBe(true);
    expect(i18n.translate('hi', 'common.save')).toBe('सेव करें');
    expect(i18n.translate('hi', 'nav.today')).toBe('आज');
    // English resolution is unaffected by the loaded Hindi dictionary.
    expect(i18n.translate('en', 'common.save')).toBe('Save');
  });

  it('loads exactly once: concurrent and repeat calls share the result', async () => {
    const i18n = await freshI18n();
    let importerCalls = 0;
    const importer = async () => {
      importerCalls += 1;
      return import('../src/lib/i18n/hi');
    };
    const [a, b] = await Promise.all([
      i18n.loadHiDictionary(importer),
      i18n.loadHiDictionary(importer),
    ]);
    expect(a).toBe(b);
    expect(importerCalls).toBe(1);
    const c = await i18n.loadHiDictionary(importer);
    expect(c).toBe(a);
    expect(importerCalls).toBe(1);
  });

  it('a failed load settles with English fallback and the next call retries', async () => {
    const i18n = await freshI18n();
    const failing: () => Promise<never> = async () => {
      throw new Error('chunk load failed');
    };
    const result = await i18n.loadHiDictionary(failing);
    expect(result).toBeNull();
    // Settled (the UI must never hang on a missing chunk) but empty:
    // Hindi still degrades to English, and English is untouched.
    expect(i18n.isHiDictionarySettled()).toBe(true);
    expect(i18n.getHiDictionary()).toBeNull();
    expect(i18n.translate('hi', 'common.save')).toBe('Save');
    // Retry with a working importer succeeds — failure is not sticky.
    const dict = await i18n.loadHiDictionary(async () => import('../src/lib/i18n/hi'));
    expect(dict?.['common.save']).toBe('सेव करें');
    expect(i18n.translate('hi', 'common.save')).toBe('सेव करें');
  });

  it('registerHiDictionary seeds synchronously (the test-setup path)', async () => {
    const i18n = await freshI18n();
    const { hi } = await import('../src/lib/i18n/hi');
    i18n.registerHiDictionary(hi);
    expect(i18n.getHiDictionary()).toBe(hi);
    expect(i18n.isHiDictionarySettled()).toBe(true);
    expect(i18n.translate('hi', 'common.save')).toBe('सेव करें');
    // A seeded registry makes loadHiDictionary a no-op.
    await expect(i18n.loadHiDictionary()).resolves.toBe(hi);
  });

  it('explicit dictionaries still win over the registry (translate contract)', async () => {
    const i18n = await freshI18n();
    const { en } = await import('../src/lib/i18n/en');
    const custom = { en, hi: { 'common.save': 'CUSTOM' } as const };
    expect(i18n.translate('hi', 'common.save', undefined, custom)).toBe('CUSTOM');
    expect(i18n.translate('hi', 'common.cancel', undefined, custom)).toBe('Cancel');
  });
});
