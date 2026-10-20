import { describe, it, expect, beforeEach } from 'vitest';
import {
  createFriendChallengeDef,
  encodeChallengeCode,
  decodeChallengeCode,
  encodeScoreCode,
  decodeScoreCode,
  extractCode,
  evaluateFriendChallenge,
  addFriendChallenge,
  removeFriendChallenge,
  mergeFriendScore,
  buildLeaderboard,
  markFriendRewardGranted,
  friendRewardDue,
  friendChallengeStatus,
  friendChallengeXpEventId,
  sanitizeFriendChallengesState,
  getInitialFriendChallengesState,
  type FriendChallengesState,
  type FriendActivityData,
} from '../src/lib/friend-challenges';
import { useStore, partializeAppState } from '../src/lib/store';
import type { WorkoutEntry, MealEntry, WorkoutSet } from '../src/lib/types';

const set = (overrides: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ reps: 10, unit: 'kg', ...overrides } as WorkoutSet);

const w = (id: string, date: string): WorkoutEntry =>
  ({ id, date, exercises: [{ name: 'Squat', sets: [set({ completed: true })] }] } as WorkoutEntry);

const m = (id: string, date: string, name: string): MealEntry =>
  ({
    id,
    date,
    name,
    foods: [{ name: 'Oats', calories: 300, proteinG: 10, carbsG: 55, fatG: 6 }],
  } as MealEntry);

const def = createFriendChallengeDef({
  id: 'fc-test-1',
  title: 'Most Workouts Wins',
  metric: 'workouts',
  target: 3,
  startDate: '2026-10-05',
  durationDays: 14,
  creatorName: 'Asha',
  createdByMe: true,
});

describe('friend challenge codes', () => {
  it('round-trips a challenge definition', () => {
    const code = encodeChallengeCode(def);
    expect(code.startsWith('fc1_')).toBe(true);
    const back = decodeChallengeCode(code);
    expect(back).not.toBeNull();
    expect(back!.id).toBe(def.id);
    expect(back!.title).toBe(def.title);
    expect(back!.metric).toBe('workouts');
    expect(back!.target).toBe(3);
    expect(back!.startDate).toBe('2026-10-05');
    expect(back!.endDate).toBe('2026-10-18');
    expect(back!.creatorName).toBe('Asha');
    // The receiver never becomes the creator.
    expect(back!.createdByMe).toBe(false);
  });

  it('survives Hindi creator names (unicode-safe encoding)', () => {
    const hindi = createFriendChallengeDef({
      id: 'fc-hindi',
      title: 'दोस्तों की चुनौती',
      metric: 'meals',
      target: 10,
      startDate: '2026-10-05',
      durationDays: 7,
      creatorName: 'शिवम',
      createdByMe: true,
    });
    const back = decodeChallengeCode(encodeChallengeCode(hindi));
    expect(back!.creatorName).toBe('शिवम');
    expect(back!.title).toBe('दोस्तों की चुनौती');
  });

  it('rejects a tampered code (single character flip)', () => {
    const code = encodeChallengeCode(def);
    const at = code.length - 3;
    const flipped =
      code.slice(0, at) + (code[at] === 'A' ? 'B' : 'A') + code.slice(at + 1);
    expect(decodeChallengeCode(flipped)).toBeNull();
  });

  it('rejects garbage, wrong prefix and score codes', () => {
    expect(decodeChallengeCode('hello world')).toBeNull();
    expect(decodeChallengeCode('fc1_!!!')).toBeNull();
    expect(decodeChallengeCode(encodeScoreCode({ challengeId: 'x', name: 'A', progress: 1, date: '2026-10-06' }))).toBeNull();
    expect(decodeScoreCode(encodeChallengeCode(def))).toBeNull();
  });

  it('extracts a code from a pasted WhatsApp-style message', () => {
    const invite = `ASCEND Friend Challenge: Most Workouts Wins\nOpen ASCEND and paste:\n${encodeChallengeCode(def)}`;
    const found = extractCode(invite, 'challenge');
    expect(found).not.toBeNull();
    expect(decodeChallengeCode(found!)).not.toBeNull();
    expect(extractCode('no code here', 'challenge')).toBeNull();
  });
});

describe('score codes', () => {
  it('round-trips a score payload', () => {
    const code = encodeScoreCode({
      challengeId: def.id,
      name: 'Ravi',
      progress: 7,
      date: '2026-10-09',
    });
    expect(code.startsWith('fs1_')).toBe(true);
    expect(decodeScoreCode(code)).toEqual({
      challengeId: def.id,
      name: 'Ravi',
      progress: 7,
      date: '2026-10-09',
    });
  });

  it('rejects impossible progress values baked into a code', () => {
    const bad = encodeScoreCode({
      challengeId: def.id,
      name: 'Ravi',
      progress: -2,
      date: '2026-10-09',
    });
    expect(decodeScoreCode(bad)).toBeNull();
  });
});

describe('evaluateFriendChallenge', () => {
  const data = (overrides: Partial<FriendActivityData> = {}): FriendActivityData => ({
    workouts: [],
    meals: [],
    prs: [],
    currentStreak: 0,
    ...overrides,
  });

  it('counts only workouts inside the window', () => {
    const e = evaluateFriendChallenge(
      def,
      data({
        workouts: [
          w('a', '2026-10-04'), // before
          w('b', '2026-10-05'), // first day
          w('c', '2026-10-18'), // last day
          w('d', '2026-10-19'), // after
        ],
      }),
    );
    expect(e.progress).toBe(2);
    expect(e.completed).toBe(false);
  });

  it('completes at the target and clamps progress', () => {
    const e = evaluateFriendChallenge(
      def,
      data({
        workouts: [w('a', '2026-10-05'), w('b', '2026-10-07'), w('c', '2026-10-09'), w('d', '2026-10-11')],
      }),
    );
    expect(e.completed).toBe(true);
    expect(e.progress).toBe(3);
    expect(e.pct).toBe(100);
  });

  it('counts breakfasts by name inside the window', () => {
    const breakfasts = createFriendChallengeDef({
      id: 'fc-bf',
      title: 'Breakfast Club',
      metric: 'breakfasts',
      target: 2,
      startDate: '2026-10-05',
      durationDays: 7,
      creatorName: 'Asha',
      createdByMe: true,
    });
    const e = evaluateFriendChallenge(
      breakfasts,
      data({
        meals: [
          m('1', '2026-10-05', 'Breakfast'),
          m('2', '2026-10-06', 'Lunch'),
          m('3', '2026-10-07', 'Breakfast'),
        ],
      }),
    );
    expect(e.progress).toBe(2);
    expect(e.completed).toBe(true);
  });
});

describe('leaderboard merge & sort', () => {
  const withChallenge = (): FriendChallengesState =>
    addFriendChallenge(getInitialFriendChallengesState(), def);

  it('merging keeps the newest score; stale codes cannot drag anyone down', () => {
    let s = withChallenge();
    s = mergeFriendScore(s, def.id, { name: 'Ravi', progress: 2, updatedDate: '2026-10-07' });
    s = mergeFriendScore(s, def.id, { name: 'Ravi', progress: 5, updatedDate: '2026-10-09' });
    expect(s.records[def.id].scores['ravi'].progress).toBe(5);
    // Older code arrives late — ignored.
    s = mergeFriendScore(s, def.id, { name: 'Ravi', progress: 3, updatedDate: '2026-10-08' });
    expect(s.records[def.id].scores['ravi'].progress).toBe(5);
    // Same-day lower code — ignored; same-day higher code wins.
    s = mergeFriendScore(s, def.id, { name: 'Ravi', progress: 4, updatedDate: '2026-10-09' });
    expect(s.records[def.id].scores['ravi'].progress).toBe(5);
    s = mergeFriendScore(s, def.id, { name: 'ravi ', progress: 6, updatedDate: '2026-10-09' });
    expect(s.records[def.id].scores['ravi'].progress).toBe(6);
  });

  it('ignores scores for unknown challenges', () => {
    const s = withChallenge();
    const next = mergeFriendScore(s, 'nope', { name: 'X', progress: 1, updatedDate: '2026-10-09' });
    expect(next).toBe(s);
  });

  it('builds a sorted board with my live row replacing my stale shared score', () => {
    let s = withChallenge();
    s = mergeFriendScore(s, def.id, { name: 'Ravi', progress: 2, updatedDate: '2026-10-09' });
    s = mergeFriendScore(s, def.id, { name: 'Meera', progress: 3, updatedDate: '2026-10-08' });
    s = mergeFriendScore(s, def.id, { name: 'Asha', progress: 1, updatedDate: '2026-10-09' });
    const board = buildLeaderboard(s.records[def.id], 'Asha', 2, '2026-10-10');
    // Meera leads on progress; Asha vs Ravi tie at 2 — my live row is the
    // freshest (today), so it wins the tie-break.
    expect(board.map((r) => r.name)).toEqual(['Meera', 'Asha', 'Ravi']);
    expect(board.find((r) => r.isMe)!.progress).toBe(2);
    expect(board.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

describe('expiry & rewards', () => {
  it('reports upcoming/active/expired by the window', () => {
    expect(friendChallengeStatus(def, '2026-10-04')).toBe('upcoming');
    expect(friendChallengeStatus(def, '2026-10-05')).toBe('active');
    expect(friendChallengeStatus(def, '2026-10-18')).toBe('active');
    expect(friendChallengeStatus(def, '2026-10-19')).toBe('expired');
  });

  it('reward is due exactly once', () => {
    let s = addFriendChallenge(getInitialFriendChallengesState(), def);
    expect(friendRewardDue(s.records[def.id], { completed: true })).toBe(true);
    expect(friendRewardDue(s.records[def.id], { completed: false })).toBe(false);
    s = markFriendRewardGranted(s, def.id);
    expect(friendRewardDue(s.records[def.id], { completed: true })).toBe(false);
    expect(friendChallengeXpEventId(def.id)).toBe(`friend-challenge:${def.id}`);
  });

  it('remove drops the record', () => {
    let s = addFriendChallenge(getInitialFriendChallengesState(), def);
    s = removeFriendChallenge(s, def.id);
    expect(s.records[def.id]).toBeUndefined();
  });
});

describe('sanitize (backup import)', () => {
  it('drops malformed records and keeps valid ones', () => {
    const raw = {
      records: {
        [def.id]: {
          def: { ...def },
          scores: { ravi: { name: 'Ravi', progress: 2, updatedDate: '2026-10-07' } },
          rewardGranted: true,
        },
        'bad-1': { def: { id: 'bad-1', metric: 'nope', startDate: '2026-10-05', endDate: '2026-10-06', target: 3 } },
        'bad-2': { def: { id: 'other-id', metric: 'workouts', startDate: '2026-10-05', endDate: '2026-10-06', target: 3 } },
      },
    };
    const clean = sanitizeFriendChallengesState(raw);
    expect(Object.keys(clean.records)).toEqual([def.id]);
    expect(clean.records[def.id].scores['ravi'].progress).toBe(2);
    expect(clean.records[def.id].rewardGranted).toBe(true);
    expect(sanitizeFriendChallengesState(null).records).toEqual({});
    expect(sanitizeFriendChallengesState('junk').records).toEqual({});
  });
});

describe('store integration', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('adds, scores and persists friend challenges', () => {
    const store = useStore.getState();
    store.addFriendChallenge(def);
    store.applyFriendScore(def.id, { name: 'Ravi', progress: 2, updatedDate: '2026-10-07' });
    const state = useStore.getState();
    expect(state.friendChallenges.records[def.id].scores['ravi'].progress).toBe(2);

    const persisted = partializeAppState(state) as Record<string, unknown>;
    expect(persisted.friendChallenges).toBeTruthy();
    expect(
      (persisted.friendChallenges as FriendChallengesState).records[def.id].def.title,
    ).toBe(def.title);
  });

  it('joining the same challenge twice keeps scores', () => {
    const store = useStore.getState();
    store.addFriendChallenge(def);
    store.applyFriendScore(def.id, { name: 'Ravi', progress: 2, updatedDate: '2026-10-07' });
    store.addFriendChallenge(def);
    expect(useStore.getState().friendChallenges.records[def.id].scores['ravi']).toBeTruthy();
  });

  it('clearAllData resets friend challenges', () => {
    useStore.getState().addFriendChallenge(def);
    useStore.getState().clearAllData();
    expect(useStore.getState().friendChallenges.records).toEqual({});
  });
});
