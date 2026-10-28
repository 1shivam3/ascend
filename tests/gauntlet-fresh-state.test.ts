import { describe, it, expect } from 'vitest';
import { buildFreshHistoryState } from '../src/lib/store';
import { getInitialXState as getInitialXpState } from '../src/lib/xp-system';
import { getInitialXState as getInitialStreakXState } from '../src/lib/streak-freeze';
import { getInitialXState as getInitialChallengesXState } from '../src/lib/challenges';
import { getInitialFriendChallengesState } from '../src/lib/friend-challenges';

/**
 * Gauntlet DI-06: the fresh slate (Start-fresh, logout-to-onboarding)
 * used to omit account-attributable slices, so a "fresh" profile
 * inherited the previous user's XP, streak, challenges, run program,
 * gym logs, portion preferences and custom muscles.
 */
describe('gauntlet DI-06: fresh history state covers account slices', () => {
  it('resets XP, streak, challenges, friends, run program, gym logs', () => {
    const fresh = buildFreshHistoryState();
    expect(fresh.xp).toEqual(getInitialXpState());
    expect(fresh.streak).toEqual(getInitialStreakXState());
    expect(fresh.challenges).toEqual(getInitialChallengesXState());
    expect(fresh.friendChallenges).toEqual(getInitialFriendChallengesState());
    expect(fresh.runProgram).toBeNull();
    expect(fresh.gymLogs).toEqual({});
    expect(fresh.userPortionPreferences).toEqual({});
    expect(fresh.customExerciseMuscles).toEqual({});
  });

  it('still resets the original slices', () => {
    const fresh = buildFreshHistoryState();
    expect(fresh.workouts).toEqual([]);
    expect(fresh.meals).toEqual([]);
    expect(fresh.bodyMetrics).toEqual([]);
    expect(fresh.waterLogs).toEqual({});
    expect(fresh.coachBlocks).toBeDefined();
    expect(fresh.weeklyReviews).toEqual([]);
    expect(fresh.goals).toEqual([]);
  });

  it('does not touch device-level preferences', () => {
    const fresh = buildFreshHistoryState();
    expect('theme' in fresh).toBe(false);
    expect('language' in fresh).toBe(false);
    expect('density' in fresh).toBe(false);
    expect('notificationPreferences' in fresh).toBe(false);
  });
});
