/**
 * UX redesign Stage 6 — Settings + Personalization regression pins.
 *
 * These are source-structure assertions (same category as the Stage 1/4/5
 * static-check updates): the IA regroup, the accent wiring, and the
 * canonical account rows. They pin the structure, not behaviour — the
 * behaviour tests live in the store/lib suites.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Stage 6 — You/Settings IA regroup', () => {
  it('SettingsView has exactly the four IA sections, in order', () => {
    const src = read('src/components/SettingsView.tsx');
    const order = [
      'settings.accountSecurity',
      'settings.appearancePersonalization',
      'settings.trainingPreferences',
      'settings.dataPrivacyLegal',
    ];
    const idx = order.map((k) => src.indexOf(`t('${k}')`));
    idx.forEach((i, j) => expect(i, `${order[j]} missing`).toBeGreaterThan(-1));
    expect(idx[0]).toBeLessThan(idx[1]);
    expect(idx[1]).toBeLessThan(idx[2]);
    expect(idx[2]).toBeLessThan(idx[3]);
    // The pre-redesign section labels are gone, not duplicated elsewhere.
    expect(src).not.toContain('settings.appPreferences');
    expect(src).not.toContain('settings.customization');
  });

  it('log out lives in Profile only — Settings has no sign-out row or modal', () => {
    const settings = read('src/components/SettingsView.tsx');
    const profile = read('src/components/ProfileView.tsx');
    expect(settings).not.toContain('showLogoutConfirm');
    expect(settings).not.toContain('handleExecuteSignOut');
    expect(settings).not.toContain("t('settings.signOut')");
    expect(profile).toContain("t('profile.logOut')");
  });

  it('Appearance & Personalization holds the three personalization controls', () => {
    const src = read('src/components/SettingsView.tsx');
    expect(src).toContain('<ThemePicker');
    expect(src).toContain("t('settings.density')");
    expect(src).toContain("t('customize.today')");
    expect(src).toContain('<CustomizeSheet');
  });

  it('the same CustomizeSheet serves Today and Settings (no second sheet)', () => {
    const settings = read('src/components/SettingsView.tsx');
    const home = read('src/components/HomePage.tsx');
    expect(settings).toContain("import CustomizeSheet from '@/components/CustomizeSheet'");
    expect(home).toContain("import CustomizeSheet from '@/components/CustomizeSheet'");
    // Sheet labels match the visible Today titles exactly (same key set).
    for (const key of [
      'home.nutrition',
      'home.coachSection',
      'home.habitsThisWeek',
      'home.quickActions',
      'home.hydration',
      'home.readiness',
      'home.level',
      'health.stepsToday',
      'home.monthlyChallenge',
      'weeklyReview.cardTitle',
    ]) {
      expect(settings, `Settings sheet missing ${key}`).toContain(`t('${key}')`);
    }
  });

  it('account methods block shows all five methods, current one marked', () => {
    const src = read('src/components/SettingsView.tsx');
    expect(src).toContain("t('settings.accountMethods')");
    expect(src).toContain("t('settings.methodGoogle')");
    expect(src).toContain("t('settings.methodApple')");
    expect(src).toContain("t('settings.methodEmailPassword')");
    expect(src).toContain("t('settings.supportedMethods')");
    expect(src).toContain('user.provider');
  });
});

describe('Stage 6 — accent wiring', () => {
  it('page.tsx applies the accent variant on selection/mode change, never as a theme-mode pick', () => {
    const src = read('src/app/page.tsx');
    expect(src).toContain('resolveAccentVariant');
    expect(src).toContain('applyAccentVars');
    expect(src).toContain('uiPreferences?.accentTheme');
    expect(src).toContain('uiPreferences?.customAccentHex');
    // The effect must not call setTheme: an accent pick is not a mode pick.
    const effect = src.slice(src.indexOf('resolveAccentVariant'));
    expect(effect.slice(0, 800)).not.toContain('setTheme(');
  });

  it('ThemePicker is presentational: no store writes, no contrast math', () => {
    const src = read('src/components/ThemePicker.tsx');
    expect(src).not.toContain('useStore');
    expect(src).not.toContain('setUiPreferences');
    expect(src).not.toContain('contrastRatio');
    expect(src).toContain('previewNote');
    expect(src).toContain('aria-pressed');
  });

  it('accent reset is scoped: it touches theme keys only', () => {
    const src = read('src/components/SettingsView.tsx');
    const reset = src.slice(src.indexOf('handleResetTheme'));
    const block = reset.slice(0, reset.indexOf('};'));
    expect(block).toContain("accentTheme: 'vermilion'");
    expect(block).toContain('customAccentHex: null');
    expect(block).not.toContain('density');
    expect(block).not.toContain('todayLayout');
  });
});
