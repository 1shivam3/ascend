import { describe, it, expect } from 'vitest';
import { buildCrossAccountResetUpdates } from '../src/lib/supabase/sync';
import { getInitialXState as getInitialXpState } from '../src/lib/xp-system';
import { getInitialXState as getInitialStreakXState } from '../src/lib/streak-freeze';
import { getInitialXState as getInitialChallengesXState } from '../src/lib/challenges';
import { getInitialFriendChallengesState } from '../src/lib/friend-challenges';

/**
 * Gauntlet DI-03: on a cross-account switch the branch promised to
 * "Replace local store completely" but replaced only the 6 synced
 * slices, leaking the previous account's unsynced data (coach blocks,
 * water/creatine logs, habits, goals, XP, streak, challenges, photos)
 * to the next signer-in on the same device.
 */
describe('gauntlet DI-03: cross-account reset updates', () => {
  it('resets every unsynced account slice to its fresh default', () => {
    const reset = buildCrossAccountResetUpdates();
    expect(reset.xp).toEqual(getInitialXpState());
    expect(reset.streak).toEqual(getInitialStreakXState());
    expect(reset.challenges).toEqual(getInitialChallengesXState());
    expect(reset.friendChallenges).toEqual(getInitialFriendChallengesState());
    expect(reset.runProgram).toBeNull();
    expect(reset.gymLogs).toEqual({});
    expect(reset.coachBlocks).toBeDefined();
    expect(reset.weeklyReviews).toEqual([]);
    expect(reset.waterLogs).toEqual({});
    expect(reset.creatineLogs).toEqual({});
    expect(reset.goals).toEqual([]);
    expect(reset.customFoods).toEqual([]);
    expect(reset.progressPhotos).toEqual([]);
    expect(reset.healthConnectLastSyncedAt).toBeNull();
    expect(reset.deletedWorkoutIds).toEqual([]);
    expect(reset.deletedMealIds).toEqual([]);
  });

  it('does NOT include the synced collections (caller sets those from remote)', () => {
    const reset = buildCrossAccountResetUpdates();
    expect('prs' in reset).toBe(false);
    expect('workouts' in reset).toBe(false);
    expect('meals' in reset).toBe(false);
    expect('bodyMetrics' in reset).toBe(false);
    expect('plannedWorkouts' in reset).toBe(false);
    expect('profile' in reset).toBe(false);
  });

  it('does NOT reset device-level preferences', () => {
    const reset = buildCrossAccountResetUpdates();
    expect('theme' in reset).toBe(false);
    expect('language' in reset).toBe(false);
    expect('density' in reset).toBe(false);
    expect('notificationPreferences' in reset).toBe(false);
  });
});
