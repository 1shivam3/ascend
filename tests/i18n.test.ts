import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, partializeAppState, DEFAULT_UI_PREFERENCES } from '../src/lib/store';
import {
  translate,
  resolveLanguage,
  getCurrentLanguage,
  weekdayNames,
  type Dictionaries,
} from '../src/lib/i18n';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

class MockStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
}
const mockStorage = new MockStorage();

beforeEach(() => {
  Object.defineProperty(global, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
  mockStorage.clear();
  useStore.getState().clearAllData();
});

describe('i18n translate()', () => {
  it('returns the English string for en', () => {
    expect(translate('en', 'common.save')).toBe('Save');
    expect(translate('en', 'nav.train')).toBe('Train');
  });

  it('returns natural Hindi (Devanagari) for hi', () => {
    expect(translate('hi', 'common.save')).toBe('सेव करें');
    expect(translate('hi', 'nav.today')).toBe('आज');
    expect(translate('hi', 'home.todaysWorkout')).toBe('आज का वर्कआउट');
    expect(translate('hi', 'meals.breakfast')).toBe('नाश्ता');
  });

  it('interpolates {params}', () => {
    expect(translate('en', 'packed.tryInstead', { name: 'Dumbbell Bench Press' })).toBe(
      'Packed gym: try Dumbbell Bench Press instead'
    );
    expect(translate('hi', 'packed.tryInstead', { name: 'पुश-अप' })).toContain('पुश-अप');
  });

  it('falls back to English when a key has no Hindi translation — never a raw key', () => {
    const partial: Dictionaries = { en, hi: { 'common.save': 'सेव करें' } };
    // A key present in en but absent from this hi dict must degrade to en.
    expect(translate('hi', 'common.cancel', undefined, partial)).toBe('Cancel');
    expect(translate('hi', 'common.save', undefined, partial)).toBe('सेव करें');
  });

  it('every en key resolves to real copy in both languages (no raw keys)', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(translate('en', key)).not.toBe(key);
      expect(translate('hi', key)).not.toBe(key);
      expect(translate('hi', key).length).toBeGreaterThan(0);
    }
  });

  it('hi dictionary only contains keys that exist in en', () => {
    for (const key of Object.keys(hi)) {
      expect(en).toHaveProperty(key);
    }
  });

  it('resolveLanguage normalizes legacy/corrupt values to en', () => {
    expect(resolveLanguage('hi')).toBe('hi');
    expect(resolveLanguage('en')).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
    expect(resolveLanguage('fr')).toBe('en');
    expect(resolveLanguage(null)).toBe('en');
  });

  it('weekday names localize, Monday-first, numerals untouched', () => {
    expect(weekdayNames('en', 'short')[0]).toBe('Mon');
    expect(weekdayNames('hi', 'short')[0]).toBe('सोम');
    expect(weekdayNames('hi', 'full')[6]).toBe('रविवार');
    expect(weekdayNames('hi')).toHaveLength(7);
  });
});

describe('language preference in the store', () => {
  it('defaults to English', () => {
    expect(DEFAULT_UI_PREFERENCES.language).toBe('en');
    expect(useStore.getState().uiPreferences.language).toBe('en');
  });

  it('setUiPreferences switches language and partialize persists it', () => {
    useStore.getState().setUiPreferences({ language: 'hi' });
    expect(useStore.getState().uiPreferences.language).toBe('hi');
    const persisted = partializeAppState(useStore.getState()) as {
      uiPreferences: { language: string };
    };
    expect(persisted.uiPreferences.language).toBe('hi');
  });

  it('clearAllData returns the language to the English default', () => {
    useStore.getState().setUiPreferences({ language: 'hi' });
    useStore.getState().clearAllData();
    expect(useStore.getState().uiPreferences.language).toBe('en');
  });
});

// Renders exactly what a component shows: strings resolved through the
// store's live language preference. (The useTranslation hook resolves via
// the same getCurrentLanguage/translate path; zustand's SSR snapshot
// pins initial state under renderToStaticMarkup, so the sample resolves
// language from live state the way client rendering does.)
function SampleSurface() {
  const lang = getCurrentLanguage();
  return React.createElement(
    'div',
    null,
    React.createElement('span', null, translate(lang, 'nav.today')),
    React.createElement('span', null, translate(lang, 'home.todaysWorkout')),
    React.createElement('button', { type: 'button' }, translate(lang, 'common.save'))
  );
}

describe('rendering key strings', () => {
  it('renders English by default', () => {
    const html = renderToStaticMarkup(React.createElement(SampleSurface));
    expect(html).toContain('Today');
    expect(html).toContain('Save');
  });

  it('renders Hindi once the preference is switched', () => {
    useStore.getState().setUiPreferences({ language: 'hi' });
    const html = renderToStaticMarkup(React.createElement(SampleSurface));
    expect(html).toContain('आज');
    expect(html).toContain('आज का वर्कआउट');
    expect(html).toContain('सेव करें');
    expect(html).not.toContain('home.todaysWorkout');
  });
});
