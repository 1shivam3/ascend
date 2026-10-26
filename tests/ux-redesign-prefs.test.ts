import { describe, it, expect } from 'vitest';
import {
  DEFAULT_UI_PREFERENCES,
  migratePersistedState,
  sanitizeUiPreferences,
} from '../src/lib/store';

describe('UX redesign personalization prefs', () => {
  it('fresh stores default to Simple density + Vermilion', () => {
    expect(DEFAULT_UI_PREFERENCES.density).toBe('simple');
    expect(DEFAULT_UI_PREFERENCES.accentTheme).toBe('vermilion');
    expect(DEFAULT_UI_PREFERENCES.customAccentHex).toBeNull();
    expect(DEFAULT_UI_PREFERENCES.workoutModeOverride).toBeNull();
    expect(DEFAULT_UI_PREFERENCES.pinnedProgressChart).toBeNull();
  });
  it('simple-for-everyone (v3): pre-redesign blobs migrate existing accounts to Simple', () => {
    // SUPERSEDES the redesign-era v2 behavior (pre-redesign → Detailed):
    // v3 migrates every existing account to Simple; users switch back to
    // Detailed in Settings in one tap. See the persist-migrate tests for
    // the full v3 cases, including the post-migration choice guard.
    const out = migratePersistedState(
      { profile: { name: 'Test' }, uiPreferences: { coachEnabled: false } },
      1,
    ) as any;
    expect(out.uiPreferences.density).toBe('simple');
    expect(out.uiPreferences.coachEnabled).toBe(false); // user value kept
    expect(out.uiPreferences.accentTheme).toBe('vermilion');
  });
  it('a stored valid density is honored by migration', () => {
    const out = migratePersistedState(
      { uiPreferences: { density: 'simple' } },
      1,
    ) as any;
    expect(out.uiPreferences.density).toBe('simple');
  });
  it('sanitize falls back per account: detailed with user data, simple without', () => {
    expect(sanitizeUiPreferences({ density: 'bogus' }, true).density).toBe('detailed');
    expect(sanitizeUiPreferences({ density: 'bogus' }, false).density).toBe('simple');
    expect(sanitizeUiPreferences({ density: 'detailed' }, false).density).toBe('detailed');
  });
  it('sanitize repairs accent + override + layout values silently', () => {
    const out = sanitizeUiPreferences(
      {
        accentTheme: 'not-a-theme',
        customAccentHex: '#zzz',
        workoutModeOverride: 'expert',
        pinnedProgressChart: 42,
        todayLayout: { visible: { nope: true }, order: 'junk' },
      },
      false,
    ) as any;
    expect(out.accentTheme).toBe('vermilion');
    expect(out.customAccentHex).toBeNull();
    expect(out.workoutModeOverride).toBeNull();
    expect(out.pinnedProgressChart).toBeNull();
    expect(out.todayLayout.order).toContain('coach');
    expect(out.todayLayout.visible).toEqual({});
  });
  it('custom theme without a valid hex falls back to Vermilion', () => {
    const out = sanitizeUiPreferences({ accentTheme: 'custom', customAccentHex: null }, false) as any;
    expect(out.accentTheme).toBe('vermilion');
    const ok = sanitizeUiPreferences(
      { accentTheme: 'custom', customAccentHex: '#abc' },
      false,
    ) as any;
    expect(ok.accentTheme).toBe('custom');
    expect(ok.customAccentHex).toBe('#AABBCC');
  });
});
