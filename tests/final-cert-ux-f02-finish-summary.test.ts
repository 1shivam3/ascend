/**
 * Final-cert UX F-02 (P2): the only workout finish summary
 * (PostWorkoutTakeModal) rendered only when coachEnabled was on
 * (`postWorkoutSummary && coachEnabled` in WorkoutPage), so users who
 * turned Coach off got no summary at all. The modal now always renders
 * on finish; only the AI Coach's Take inside it is conditional.
 * Source-pin tests (the gating lives in JSX render conditions).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('final-cert UX F-02: finish summary is not gated by Coach', () => {
  it('WorkoutPage renders the modal on postWorkoutSummary alone and passes coachEnabled down', () => {
    const src = read('src/components/WorkoutPage.tsx');
    expect(src).toContain('{postWorkoutSummary && (');
    expect(src).not.toContain('postWorkoutSummary && coachEnabled');
    expect(src).toContain('coachEnabled={coachEnabled}');
  });

  it('the modal defaults coachEnabled to true (existing coach-surface callers unchanged)', () => {
    const src = read('src/components/PostWorkoutTakeModal.tsx');
    expect(src).toContain('coachEnabled = true');
    expect(src).toContain('coachEnabled?: boolean');
  });

  it('only the Coach\u2019s Take card is conditional; the take fetch is skipped when Coach is off', () => {
    const src = read('src/components/PostWorkoutTakeModal.tsx');
    expect(src).toContain('{coachEnabled && (loading ? (');
    expect(src).toContain('if (isOpen && !coachEnabled)');
    // The summary metrics are NOT inside the coachEnabled gate: the
    // Quick Numbers bar precedes the Take card in the file.
    const numbersIdx = src.indexOf('take.duration');
    const takeGateIdx = src.indexOf('{coachEnabled && (loading ? (');
    expect(numbersIdx).toBeGreaterThan(-1);
    expect(numbersIdx).toBeLessThan(takeGateIdx);
  });
});
