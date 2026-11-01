/**
 * Open-items UX F-01 (P2): seeded defaults must not pose as user data.
 * (a) Onboarding: the plan-offer food target carries a prominent
 *     defaults line (the simplified flow never asks weight/height),
 *     and the "Your setup" summary badges level/days/diet as defaults
 *     with a footnote. The defaults themselves stay (owner decision
 *     2026-10-26) — they are now labelled, not hidden.
 * (b) Progress Body: while no real body log exists, the displayed
 *     bodyweight is the seeded profile default — the legend reads
 *     "Profile value — not measured yet" and the value carries the
 *     est. marker; a real log restores the measured labelling.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('open-items UX F-01: defaults labelled as defaults', () => {
  it('new keys exist in both dictionaries (parity)', () => {
    for (const key of [
      'onboarding.foodTargetDefaultsNote',
      'onboarding.summaryDefaultBadge',
      'onboarding.summaryDefaultsNote',
      'progress.legendProfileDefault',
    ] as const) {
      expect(en[key], `en ${key}`).toBeTruthy();
      expect(hi[key], `hi ${key}`).toBeTruthy();
    }
    expect(en['onboarding.foodTargetDefaultsNote']).toContain('{weight}');
    expect(en['onboarding.foodTargetDefaultsNote']).toContain('{height}');
  });

  it('plan offer shows the prominent defaults line with the assumed stats', () => {
    const src = read('src/components/Onboarding.tsx');
    expect(src).toContain("t('onboarding.foodTargetDefaultsNote', { weight, unit, height: heightCm })");
    expect(src).toContain('text-xs font-semibold text-accent-text');
  });

  it('summary badges the never-asked rows as defaults and shows the footnote', () => {
    const onboarding = read('src/components/Onboarding.tsx');
    expect(onboarding).toContain('defaulted={{ level: true, days: true, diet: true }}');
    const summary = read('src/components/onboarding/SummaryScreen.tsx');
    expect(summary).toContain("t('onboarding.summaryDefaultBadge')");
    expect(summary).toContain("t('onboarding.summaryDefaultsNote')");
    expect(summary).toContain('row.defaulted');
  });

  it('Progress: measured labelling is conditional on a real body log', () => {
    const src = read('src/components/ProgressPage.tsx');
    expect(src).toContain('const weightIsMeasured = sortedMetrics.length > 0;');
    const legends = src.match(/weightIsMeasured \? t\('progress\.legendMeasured'\) : t\('progress\.legendProfileDefault'\)/g) ?? [];
    expect(legends.length).toBe(2); // spotlight + Body measurements card
    expect(src).toContain("!weightIsMeasured && bodyweightAnalytics.latestWeight != null");
    // The unconditional measured claim is gone.
    expect(src).not.toContain("<span>{t('progress.legendMeasured')}</span>");
  });
});
