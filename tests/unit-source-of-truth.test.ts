/**
 * Task 2.1 (2026-11-05): units single source of truth.
 *
 * Audit findings this pins:
 * - `profile.unit` is the one stored preference (written by onboarding,
 *   Edit Profile save, Settings, Progress Tools). The Body Metrics
 *   modal's KG/LBS toggle only converts the in-progress entry and NEVER
 *   writes profile.unit (its save path, updateBodyMetrics, preserves
 *   the profile unit) — yet it looks identical to the app-wide
 *   switches. The modal now says so on screen
 *   (`bodyMetrics.entryUnitNote`), and the first test below guards the
 *   claim: if the modal ever gains a setProfile write, the copy must
 *   be revisited, so the test fails.
 * - Round-trip drift: the canonical body-stat converter
 *   (toStoredBodyStats, used at save) rounds both fields to a 1-dp
 *   grid. Because the lbs grid (0.1 lb ≈ 0.045 kg) is finer than half
 *   a kg step (0.05 kg), every 1-dp kg bodyweight survives a
 *   kg→lbs→kg cycle unchanged — drift never compounds in
 *   bodyweightKg; only the secondary lbs field quantises (≤0.1 lb).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { toStoredBodyStats } from '../src/lib/body-stats';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('Body Metrics entry-unit note (Task 2.1)', () => {
  it('the modal keeps NOT writing profile.unit (the copy depends on it)', () => {
    const modal = read('src/components/BodyMetricsModal.tsx');
    expect(modal).not.toContain('setProfile');
    expect(modal).toContain("t('bodyMetrics.entryUnitNote'");
  });

  it('English + Hindi notes exist and state the entry-only scope', () => {
    expect(en['bodyMetrics.entryUnitNote']).toContain('this entry only');
    expect(en['bodyMetrics.entryUnitNote']).toContain('{unit}');
    expect(hi['bodyMetrics.entryUnitNote']).toBeTruthy();
    expect(hi['bodyMetrics.entryUnitNote']).toContain('{unit}');
  });
});

describe('bodyweight unit round-trip (Task 2.1)', () => {
  it('every 1-dp kg value in range survives kg→lbs→kg unchanged', () => {
    for (let kg10 = 300; kg10 <= 3000; kg10 += 1) {
      const kg = kg10 / 10;
      const asStored = toStoredBodyStats(kg, 175, 'kg');
      const backAgain = toStoredBodyStats(asStored.bodyweightLbs, 69, 'lbs');
      expect(backAgain.bodyweightKg).toBe(kg);
    }
  });

  it('the brief’s spot check: 100 kg round-trips to exactly 100.0 kg', () => {
    const asStored = toStoredBodyStats(100, 175, 'kg');
    expect(asStored.bodyweightLbs).toBe(220.5); // quantised secondary field
    const backAgain = toStoredBodyStats(asStored.bodyweightLbs, 69, 'lbs');
    expect(backAgain.bodyweightKg).toBe(100);
  });
});
