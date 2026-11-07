import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

// QA-hardening R4 — two "Levels" disambiguated.
//
// The app had two unrelated numbers both called "Level": the XP
// progression (gamification) and the strength standing (per-lift /
// overall strength scale). The XP system is now "XP level" everywhere
// it is named; the strength standing is presented as
// "Strength tier: <name>". Each carries a one-line helper explaining
// what it measures.

const E = en as Record<string, string>;
const H = hi as unknown as Record<string, string>;

describe('QA R4 — XP progression is named "XP level"', () => {
  it('sheet, card and aria copy all say XP level', () => {
    expect(E['level.yourLevel']).toBe('Your XP level');
    expect(E['level.levelWord']).toBe('XP level {level}');
    expect(E['level.summary']).toContain('to XP level {next}');
    expect(E['level.inLevel']).toContain('in this XP level');
    expect(E['level.aria']).toBe('XP level details');
    expect(E['home.level']).toBe('XP level');
    expect(E['home.toLevel']).toBe('to XP level {level}');
    expect(E['home.viewLevelDetails']).toBe('View XP level details');
  });

  it('the XP sheet carries the one-line helper (en + hi)', () => {
    expect(E['level.helper']).toContain('consistency, not strength');
    expect(H['level.helper']).toBeTruthy();
    expect(readFileSync('src/components/LevelSheet.tsx', 'utf8')).toContain("t('level.helper')");
  });
});

describe('QA R4 — strength standing is "Strength tier: <name>"', () => {
  it('profile chip, records row, modal and recap pill name the tier', () => {
    expect(E['profile.strengthTier']).toBe('Strength tier: {tier}');
    expect(E['prs.strengthTier']).toBe('Strength tier: {tier}');
    expect(E['prs.levelProgression']).toBe('Strength tier progression');
    expect(E['prs.toReachTier']).toContain('{tier}');
    expect(E['recap.strengthTier']).toBe('Strength tier');
    expect(E['profile.levelTablesNote']).toContain('Strength tiers use');
    expect(E['profile.estimatedLifts']).toContain('excluded from this tier');
    expect(E['prs.estimatedLevel']).toContain('Estimated tier');
  });

  it('the old ambiguous keys are gone from both languages', () => {
    for (const dict of [E, H]) {
      expect(dict['profile.level']).toBeUndefined();
      expect(dict['prs.level']).toBeUndefined();
      expect(dict['prs.toReachLevel']).toBeUndefined();
    }
  });

  it('no strength surface renders a bare Level/LV label anymore', () => {
    const prsPage = readFileSync('src/components/PRsPage.tsx', 'utf8');
    expect(prsPage).toContain("t('prs.strengthTier'");
    expect(prsPage).toContain("t('prs.toReachTier'");
    expect(prsPage).not.toContain('LV {');
    const profile = readFileSync('src/components/ProfileView.tsx', 'utf8');
    expect(profile).toContain("t('profile.strengthTier'");
    const recap = readFileSync('src/components/WeeklyRecapModal.tsx', 'utf8');
    expect(recap).toContain("t('recap.strengthTier')");
  });

  it('Hindi carries the same renames', () => {
    expect(H['level.yourLevel']).toContain('XP');
    expect(H['home.level']).toContain('XP');
    expect(H['profile.strengthTier']).toContain('{tier}');
    expect(H['prs.strengthTier']).toContain('{tier}');
    expect(H['recap.strengthTier']).toBeTruthy();
  });
});
