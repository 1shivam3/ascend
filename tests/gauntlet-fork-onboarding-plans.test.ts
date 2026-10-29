/**
 * Fork self-trigger via onboarding plans (found live on the c4efbcbb
 * preview, 2026-10-29; root-caused in code the same day).
 *
 * Mechanism: page.tsx renders the FND-06 history fork instead of
 * Onboarding whenever the profile is null and hasRetainedHistory()
 * is true — and plans count as retained history. Onboarding stages
 * the profile until the summary's Continue (live-fix L1), but the
 * plan-offer Accept handler used to write the accepted plans into
 * the store immediately. The fork therefore replaced Onboarding
 * mid-flow, destroyed the staged profile, and bounced the user
 * back to the welcome screen — the TRIAGE-PA-01 self-trigger class,
 * via plans instead of targets.
 *
 * Fix: accepted plans stay staged (acceptedPlans state) and land
 * only inside applyPendingProfile, together with the profile.
 *
 * These tests pin (a) the boot protection is NOT weakened — plans
 * still count as retained history for a genuinely profile-less
 * boot — and (b) the staging contract in Onboarding.tsx.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasRetainedHistory } from '../src/lib/history-fork';

describe('fork boot protection is preserved', () => {
  it('plans alone still count as retained history at a profile-less boot', () => {
    expect(
      hasRetainedHistory({
        workouts: [],
        meals: [],
        plannedWorkouts: [{ id: 'p1' }],
        prs: [],
        bodyMetrics: [],
      })
    ).toBe(true);
  });

  it('empty state does not trigger the fork', () => {
    expect(
      hasRetainedHistory({
        workouts: [],
        meals: [],
        plannedWorkouts: [],
        prs: [],
        bodyMetrics: [],
      })
    ).toBe(false);
  });
});

describe('Onboarding plan-accept staging contract', () => {
  const src = readFileSync(resolve(__dirname, '../src/components/Onboarding.tsx'), 'utf8');

  const acceptBody = src.slice(
    src.indexOf('const handleAcceptPlans'),
    src.indexOf('const handleDeclinePlans')
  );
  const applyBody = src.slice(
    src.indexOf('const applyPendingProfile'),
    src.indexOf('const handleAcceptPlans')
  );

  it('Accept stages the plans instead of writing them to the store', () => {
    expect(acceptBody).toContain('setAcceptedPlans(pendingPlans)');
    expect(acceptBody).not.toContain('setPlannedWorkouts(');
    expect(acceptBody).not.toContain('setWeeklySchedule(');
  });

  it('applyPendingProfile lands the accepted plans with the profile', () => {
    expect(applyBody).toContain('setPlannedWorkouts(acceptedPlans)');
    expect(applyBody).toContain('setWeeklySchedule(acceptedSchedule)');
  });
});
