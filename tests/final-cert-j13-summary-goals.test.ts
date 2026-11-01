/**
 * Final-cert J1.3 (P3): the onboarding "Your setup" summary's GOAL line
 * showed only the first (primary) selected goal while Profile lists
 * all of them. The summary now joins the labels of every selected goal.
 * Source-pin test (the summary value is computed inline in
 * Onboarding.tsx's summary branch) + a label-join behaviour check
 * against the real goal configs.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ATHLETE_GOAL_CONFIGS, type AthleteGoal } from '../src/lib/types';

describe('final-cert J1.3: onboarding summary GOAL line', () => {
  it('joins all selected goal labels (the computation the summary performs)', () => {
    const goals: AthleteGoal[] = ['build_muscle', 'get_stronger'];
    const label = goals.map((g) => ATHLETE_GOAL_CONFIGS[g].label).join(', ');
    expect(label).toContain(ATHLETE_GOAL_CONFIGS.build_muscle.label);
    expect(label).toContain(ATHLETE_GOAL_CONFIGS.get_stronger.label);
    expect(label.split(', ')).toHaveLength(2);
  });

  it('Onboarding passes the joined all-goals label to SummaryScreen', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/components/Onboarding.tsx'), 'utf8');
    expect(src).toContain('summaryGoals.map((g) => ATHLETE_GOAL_CONFIGS[g].label)');
    expect(src).toContain('goal={summaryGoalLabel}');
    expect(src).not.toContain('goal={ATHLETE_GOAL_CONFIGS[summaryGoal].label}');
  });
});
