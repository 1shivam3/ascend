/**
 * Open-items P3 polish batch (browser-journey observations):
 *  J2.1 the floating rest pill showed a "1:30" countdown before any
 *       set was completed — it now renders only while a rest timer
 *       is genuinely active.
 *  J2.2 the Set Complete screen echoes the set's chosen RPE.
 *  J2.5 on Train, the live rest-timer section sits above Your Plans
 *       (it renders only during an active session, so the
 *       no-session layout is untouched).
 *  J4.2 "Last 5 Sessions" rows show every set compactly under the
 *       best-set line instead of implying the best set was the
 *       whole session.
 *  J6  the Today card distinguishes a completed session's real
 *       duration ("Done in …") from a plan estimate.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('open-items P3 polish', () => {
  it('J2.1: floating rest pill is gated on a genuinely active timer', () => {
    const src = read('src/components/ActiveWorkoutScreen.tsx');
    expect(src).toContain('{(isRestRunning || isRestFinished || restSecondsLeft > 0) && (');
  });

  it('J2.2: the completed-set summary carries and echoes the chosen RPE', () => {
    const src = read('src/components/ActiveWorkoutScreen.tsx');
    expect(src).toContain('rpe: targetSet.rpe,');
    expect(src).toContain('completedSetSummary.rpe != null');
    expect(src).toContain('RPE {completedSetSummary.rpe}');
  });

  it('J2.5: rest-timer section precedes Your Plans on the Train page', () => {
    const src = read('src/components/WorkoutPage.tsx');
    const timerIdx = src.indexOf('Contextual Rest Timer');
    const plansIdx = src.indexOf('── Your Plans ──');
    expect(timerIdx).toBeGreaterThan(-1);
    expect(plansIdx).toBeGreaterThan(-1);
    expect(timerIdx).toBeLessThan(plansIdx);
    // Still conditional — no-session layout unchanged.
    expect(src).toContain('{isRestRunning && (');
  });

  it('J4.2: session rows carry all sets and render them compactly', () => {
    const src = read('src/components/ProgressPage.tsx');
    expect(src).toContain('sets: s.sets.map((st) => ({ weight:');
    expect(src).toContain("s.sets.map((set) => `${set.weight}×${set.reps}`).join(' · ')");
    expect(src).toContain('s.sets.length > 1');
  });

  it('J6: completed sessions use the done-in duration keys (EN+HI)', () => {
    const src = read('src/components/HomePage.tsx');
    expect(src).toContain("sessionInfo.status === 'completed'");
    expect(src).toContain("'home.durationDoneExercises'");
    expect(src).toContain("'home.durationDoneOnly'");
    for (const key of ['home.durationDoneExercises', 'home.durationDoneExercisesOne', 'home.durationDoneOnly'] as const) {
      expect(en[key], `en ${key}`).toBeTruthy();
      expect(hi[key], `hi ${key}`).toBeTruthy();
    }
    expect(en['home.durationDoneExercises']).toContain('Done in');
  });
});
