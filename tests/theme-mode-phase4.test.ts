/**
 * Phase 4.6 — §35 theme mode migration + accent write validation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useStore,
  migratePersistedState,
  partializeAppState,
} from '@/lib/store';
import { themeModeFromLegacy, resolveTheme } from '@/lib/types';
import { resolveAccentWrite } from '@/lib/accent-themes';

describe('§35 legacy derivation', () => {
  it('explicit choices migrate to their mode; everything else was system', () => {
    expect(themeModeFromLegacy('dark', true)).toBe('dark');
    expect(themeModeFromLegacy('light', true)).toBe('light');
    expect(themeModeFromLegacy('dark', false)).toBe('system');
    expect(themeModeFromLegacy('light', undefined)).toBe('system');
    expect(themeModeFromLegacy('bogus', true)).toBe('system');
  });

  it('resolveTheme: explicit wins, system follows the OS', () => {
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('system', 'dark')).toBe('dark');
  });
});

describe('§35 blob migration', () => {
  it('a pre-§35 blob gains themeMode and loses the boolean', () => {
    const out = migratePersistedState(
      { theme: 'light', hasCustomTheme: true, workouts: [] },
      3,
    ) as any;
    expect(out.themeMode).toBe('light');
    expect('hasCustomTheme' in out).toBe(false);
  });

  it('a system-following blob (custom=false) migrates to system', () => {
    const out = migratePersistedState(
      { theme: 'dark', hasCustomTheme: false },
      3,
    ) as any;
    expect(out.themeMode).toBe('system');
  });

  it('a valid stored themeMode is never rewritten', () => {
    const out = migratePersistedState(
      { theme: 'dark', hasCustomTheme: true, themeMode: 'system' },
      3,
    ) as any;
    expect(out.themeMode).toBe('system');
  });

  it('partialize persists the mode, not the resolved snapshot pair', () => {
    const state = useStore.getState();
    const out = partializeAppState(state) as any;
    expect(out.themeMode).toBe(state.themeMode);
    expect('hasCustomTheme' in out).toBe(false);
    expect('theme' in out).toBe(false);
  });
});

describe('§35 accent writes', () => {
  it('resolveAccentWrite: valid custom hex is normalized and kept', () => {
    expect(resolveAccentWrite('custom', '#abc')).toEqual({
      accentTheme: 'custom',
      customAccentHex: '#AABBCC',
    });
  });

  it('resolveAccentWrite: invalid hex is NEVER stored as custom', () => {
    expect(resolveAccentWrite('custom', 'not-a-hex')).toEqual({
      accentTheme: 'vermilion',
      customAccentHex: null,
    });
    expect(resolveAccentWrite('custom', null).accentTheme).toBe('vermilion');
    expect(resolveAccentWrite('bogus-id', '#AABBCC').accentTheme).toBe('vermilion');
  });

  it('setUiPreferences applies the same rule at the store boundary', () => {
    useStore.getState().setUiPreferences({
      accentTheme: 'custom',
      customAccentHex: 'garbage',
    } as any);
    const prefs = useStore.getState().uiPreferences;
    expect(prefs.accentTheme).toBe('vermilion');
    expect(prefs.customAccentHex).toBeNull();

    useStore.getState().setUiPreferences({
      accentTheme: 'custom',
      customAccentHex: '#123abc',
    } as any);
    const prefs2 = useStore.getState().uiPreferences;
    expect(prefs2.accentTheme).toBe('custom');
    expect(prefs2.customAccentHex).toBe('#123ABC');
  });
});
