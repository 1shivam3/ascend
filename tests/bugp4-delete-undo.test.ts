/**
 * T4 (bug program Phase 4): delete + Undo, verified per delete type.
 *
 * Workout / meal / food / plan deletes already had Undo (covered by
 * toast-undo.test.tsx and qa-phase1-r1). PR deletion was the gap:
 * handleDeletePR removed the record behind a plain info toast. It
 * now snapshots the record and offers Undo through insertPRAt,
 * which restores the record at its index AND clears its tombstone
 * (or the next sync would re-delete the restore).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import type { PersonalRecord } from '../src/lib/types';

const PR_A: PersonalRecord = {
  id: 'pr-a', exercise: 'Bench Press', weightKg: 100, weightLbs: 220.5,
  reps: 5, oneRepMax: 116.7, date: '2026-10-26', notes: 'All-Time 1RM PR', prType: '1rm',
};
const PR_B: PersonalRecord = {
  id: 'pr-b', exercise: 'Squat', weightKg: 140, weightLbs: 308.6,
  reps: 3, oneRepMax: 154, date: '2026-11-02', notes: 'Tested at the gym meet', prType: '1rm',
};
const PR_C: PersonalRecord = {
  id: 'pr-c', exercise: 'Deadlift', weightKg: 180, weightLbs: 396.8,
  reps: 1, oneRepMax: 180, date: '2026-11-09', notes: 'All-Time 1RM PR', prType: '1rm',
};

describe('T4: PR delete + Undo', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
    useStore.setState({ prs: [PR_A, PR_B, PR_C] });
  });

  it('delete removes the record and tombstones it; undo restores it in place and clears the tombstone', () => {
    const st = useStore.getState();
    st.deletePR('pr-b');
    let s = useStore.getState();
    expect(s.prs.map((p) => p.id)).toEqual(['pr-a', 'pr-c']);
    expect(s.deletedPrIds).toContain('pr-b');

    s.insertPRAt(PR_B, 1);
    s = useStore.getState();
    expect(s.prs.map((p) => p.id)).toEqual(['pr-a', 'pr-b', 'pr-c']);
    expect(s.prs[1]).toMatchObject({ weightKg: 140, oneRepMax: 154 });
    expect(s.deletedPrIds).not.toContain('pr-b');
  });

  it('double-undo is a no-op (no duplicate record)', () => {
    const st = useStore.getState();
    st.deletePR('pr-b');
    st.insertPRAt(PR_B, 1);
    st.insertPRAt(PR_B, 1);
    expect(useStore.getState().prs.map((p) => p.id)).toEqual(['pr-a', 'pr-b', 'pr-c']);
  });

  it('chained: delete → undo → delete → undo converges to the same record set', () => {
    const st = useStore.getState();
    for (let round = 0; round < 2; round++) {
      st.deletePR('pr-a');
      expect(useStore.getState().prs.map((p) => p.id)).toEqual(['pr-b', 'pr-c']);
      st.insertPRAt(PR_A, 0);
      expect(useStore.getState().prs.map((p) => p.id)).toEqual(['pr-a', 'pr-b', 'pr-c']);
      expect(useStore.getState().deletedPrIds).not.toContain('pr-a');
    }
  });

  it('undo of one PR does not disturb another PR deleted in the meantime', () => {
    const st = useStore.getState();
    st.deletePR('pr-a');
    st.deletePR('pr-c');
    st.insertPRAt(PR_A, 0);
    const s = useStore.getState();
    expect(s.prs.map((p) => p.id)).toEqual(['pr-a', 'pr-b']);
    expect(s.deletedPrIds).toContain('pr-c');
    expect(s.deletedPrIds).not.toContain('pr-a');
  });
});
