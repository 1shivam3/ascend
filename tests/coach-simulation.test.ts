/**
 * Coach simulation harness — invariant audits.
 *
 * Six synthetic personas are run through 12 weeks of training against the
 * app's REAL store + coach engine (see coach-sim-harness.ts). These tests
 * assert the behaviors the engine claims, and CHARACTERIZE the behaviors it
 * observably has today where the two differ. Characterization tests are
 * marked [CHARACTERIZATION]: they pin current behavior — including bugs the
 * sim uncovered — so a future fix trips them deliberately and they get
 * updated with the fix, never silently.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { isoAdd, runSimulation, type PersonaDef, type SimTrace } from './coach-sim-harness';
import {
  ALL_PERSONAS,
  beginnerPersona,
  erraticPersona,
  fastProgresserPersona,
  injuryPersona,
  painFlarePersona,
  stallerPersona,
} from './coach-sim-personas';
import { detectStalls } from '@/lib/coach-engine';
import { getExerciseHistorySessions } from '@/lib/lifter-twin';
import { useAppStore } from '@/lib/store';
import { getMovementFamily } from '@/lib/workout-engine';
import type { WorkoutEntry } from '@/lib/types';

const traces = new Map<string, SimTrace>();
function traceFor(p: PersonaDef): SimTrace {
  const t = traces.get(p.id);
  if (!t) throw new Error(`trace for ${p.id} not built`);
  return t;
}

beforeAll(() => {
  for (const p of ALL_PERSONAS) traces.set(p.id, runSimulation(p));
}, 300000);

function appliedDecisions(t: SimTrace) {
  return t.sessions.flatMap((s) =>
    s.exercises
      .filter((e) => e.decision?.applied)
      .map((e) => ({ session: s, exercise: e, decision: e.decision! }))
  );
}

function exerciseSeries(t: SimTrace, name: string) {
  return t.sessions.flatMap((s) =>
    s.exercises
      .filter((e) => e.name === name)
      .map((e) => ({ week: s.week, date: s.date, planName: s.planName, ...e }))
  );
}

// ---------------------------------------------------------------------------

describe('harness integrity', () => {
  it('is deterministic: the same persona produces the same run twice', () => {
    const again = runSimulation(beginnerPersona);
    const first = traceFor(beginnerPersona);
    expect(again.sessions.length).toBe(first.sessions.length);
    expect(
      again.sessions.map((s) => s.exercises.map((e) => e.targetBefore.weight))
    ).toEqual(
      first.sessions.map((s) => s.exercises.map((e) => e.targetBefore.weight))
    );
  }, 120000);

  it('every persona completes 12 weeks with sessions and week records', () => {
    for (const p of ALL_PERSONAS) {
      const t = traceFor(p);
      expect(t.weeks).toHaveLength(12);
      expect(t.sessions.length).toBeGreaterThan(0);
      expect(t.blocks.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('block structure (engine claim: deload penultimate, test final)', () => {
  it('every generated block ends [..., deload, test]', () => {
    for (const p of ALL_PERSONAS) {
      for (const b of traceFor(p).blocks) {
        const types = b.weeks.map((w) => w.type);
        expect(types[types.length - 1]).toBe('test');
        expect(types[types.length - 2]).toBe('deload');
        expect(types.slice(0, -2).every((x) => x === 'build')).toBe(true);
      }
    }
  });

  it('beginner blocks are 5 weeks, intermediate blocks are 6', () => {
    expect(traceFor(beginnerPersona).blocks[0].weeks).toHaveLength(5);
    expect(traceFor(stallerPersona).blocks[0].weeks).toHaveLength(6);
  });
});

describe('load progression bounds (all personas)', () => {
  it('no applied progression ever moves load by more than one 2.5 kg step, or reps by more than +1', () => {
    for (const p of ALL_PERSONAS) {
      for (const { decision } of appliedDecisions(traceFor(p))) {
        expect(decision.deltaWeight).toBeGreaterThanOrEqual(0);
        expect(decision.deltaWeight).toBeLessThanOrEqual(2.5);
        expect(decision.deltaReps).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the only >10% load jumps are the fixed 2.5 kg step landing on lifts under 25 kg', () => {
    const flags: { persona: string; exercise: string; base: number; pct: number }[] = [];
    for (const p of ALL_PERSONAS) {
      const t = traceFor(p);
      for (const s of t.sessions) {
        for (const e of s.exercises) {
          const w = e.targetBefore.weight;
          if (e.decision?.applied && e.decision.deltaWeight > 0 && w) {
            const pct = (e.decision.deltaWeight / w) * 100;
            if (pct > 10) flags.push({ persona: p.id, exercise: e.name, base: w, pct });
          }
        }
      }
    }
    // The audit must actually find the known artifacts (else it is vacuous)…
    expect(flags.length).toBeGreaterThanOrEqual(8);
    // …and every one of them is the fixed step on a light lift, never a
    // genuinely oversized jump on a heavy lift.
    for (const f of flags) expect(f.base).toBeLessThanOrEqual(22.5);
  });

  it('no persona ever has a load REDUCTION applied in 12 weeks', () => {
    // Deload proposals exist (see staller suite) but the athlete-confirmed
    // application path can never execute one — reductions are proposals
    // only. [CHARACTERIZATION]
    for (const p of ALL_PERSONAS) {
      const reductions = appliedDecisions(traceFor(p)).filter(
        ({ decision }) => decision.deltaWeight < 0
      );
      expect(reductions).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------

describe('persona: consistent beginner', () => {
  it('progresses the main lifts across block 1 and never misses', () => {
    const t = traceFor(beginnerPersona);
    const squat = exerciseSeries(t, 'Squat').filter((r) => r.week <= 5);
    expect(squat[squat.length - 1].targetBefore.weight!).toBeGreaterThan(
      squat[0].targetBefore.weight!
    );
    expect(t.weeks.every((w) => w.missedDetected === 0)).toBe(true);
    expect(t.sessions).toHaveLength(36);
  });

  it('[CHARACTERIZATION] one plan prescribes Lat Pulldown at 0 kg while another prescribes it at 30 kg', () => {
    const t = traceFor(beginnerPersona);
    const upperB = exerciseSeries(t, 'Lat Pulldown').find((r) =>
      r.planName.includes('Upper B')
    );
    expect(upperB?.targetBefore.weight).toBe(0);
  });
});

describe('persona: erratic intermediate', () => {
  it('missed sessions are detected, including the full missed week', () => {
    const t = traceFor(erraticPersona);
    expect(t.weeks[7].missedDetected).toBe(4); // week 8: everything missed
    expect(t.weeks[3].missedDetected).toBe(0); // week 4: trained everything
    const totalMissed = t.weeks.reduce((a, w) => a + w.missedDetected, 0);
    expect(totalMissed).toBeGreaterThanOrEqual(10);
  });

  it('resuming after the missed week produces single-step progressions only — no catching up', () => {
    const t = traceFor(erraticPersona);
    const week9 = appliedDecisions(t).filter(({ session }) => session.week === 9);
    expect(week9.length).toBeGreaterThan(0);
    for (const { decision } of week9) {
      expect(decision.deltaWeight).toBeLessThanOrEqual(2.5);
      expect(decision.deltaReps).toBeLessThanOrEqual(1);
    }
  });
});

describe('persona: pain flare (weeks 5-7)', () => {
  it('pain-flagged pressing is never progressed while pain is reported', () => {
    const t = traceFor(painFlarePersona);
    const bad = t.sessions
      .filter((s) => s.week >= 5 && s.week <= 7)
      .flatMap((s) => s.exercises)
      .filter(
        (e) =>
          (e.family === 'horizontal_push' || e.family === 'vertical_push') &&
          e.decision?.applied
      );
    expect(bad).toHaveLength(0);
  });

  it('every pain-window pressing session is stopped by SAFETY-01 or a digest hold', () => {
    const t = traceFor(painFlarePersona);
    const pressing = t.sessions
      .filter((s) => s.week >= 5 && s.week <= 6) // block-1 pain window
      .flatMap((s) => s.exercises)
      .filter(
        (e) => e.family === 'horizontal_push' || e.family === 'vertical_push'
      );
    expect(pressing.length).toBeGreaterThanOrEqual(8);
    for (const e of pressing) {
      const stopped =
        e.decision?.ruleId === 'SAFETY-01' || e.adjustNext?.action === 'hold';
      expect(stopped).toBe(true);
    }
  });

  it('the next block drops every pain-flagged pressing lift, with a pain warning each', () => {
    const t = traceFor(painFlarePersona);
    const block2Names = t.blocks[1].allExerciseNames;
    for (const lift of [
      'Bench Press',
      'Overhead Press',
      'Incline Bench',
      'Dumbbell Shoulder Press',
    ]) {
      expect(block2Names).not.toContain(lift);
    }
    expect(t.blocks[1].warnings).toHaveLength(4);
    expect(t.blocks[1].warnings.every((w) => /pain/i.test(w))).toBe(true);
  });

  it('[CHARACTERIZATION] readiness stays >= 90 ("primed") through the pain weeks — painAreas move the score by 0', () => {
    const t = traceFor(painFlarePersona);
    const painWeeks = t.sessions.filter((s) => s.week >= 5 && s.week <= 7);
    expect(painWeeks.length).toBeGreaterThan(0);
    for (const s of painWeeks) expect(s.readiness.score).toBeGreaterThanOrEqual(90);
  });

  it('the weekly review escalates the pain pattern while it is active', () => {
    const t = traceFor(painFlarePersona);
    expect(t.weeks[4].review?.painEscalation).toBeTruthy();
    expect(t.weeks[5].review?.painEscalation).toBeTruthy();
  });
});

describe('persona: declared injury (shoulder limitation)', () => {
  it('no vertical-push exercise appears in any generated plan, ever', () => {
    const t = traceFor(injuryPersona);
    for (const name of t.allPlanExerciseNames) {
      expect(getMovementFamily(name)).not.toBe('vertical_push');
    }
    expect(t.allPlanExerciseNames).not.toContain('Overhead Press');
    expect(t.allPlanExerciseNames).not.toContain('Dumbbell Shoulder Press');
  });

  it('upper days are substituted, not emptied', () => {
    const t = traceFor(injuryPersona);
    expect(t.allPlanExerciseNames).toContain('Push-ups');
    for (const b of t.blocks) {
      for (const d of b.planDays) expect(d.exercises.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('persona: fast progresser', () => {
  it('progresses steadily within block 1', () => {
    const t = traceFor(fastProgresserPersona);
    const bench = exerciseSeries(t, 'Bench Press').filter((r) => r.week <= 6);
    expect(bench[bench.length - 1].targetBefore.weight!).toBeGreaterThanOrEqual(
      bench[0].targetBefore.weight!
    );
    expect(appliedDecisions(t).length).toBeGreaterThan(100);
  });

  it('week-10 stall flags carry each lift\'s OWN numbers — Squat and Front Squat no longer share a series', () => {
    // Was [CHARACTERIZATION] ("the stall detector still flags 8+ of his
    // lifts"): the raw count was never the cleanest signal — substring
    // history merging both manufactured identical flags (see the probe
    // below) and masked real ones. What exact stall history guarantees
    // is that every flag is computed from the flagged lift's own
    // sessions. Re-run the persona fresh so the store holds his
    // workouts, replay detection at week 10, and compare the two lifts
    // the merge used to fuse into one series.
    const t = runSimulation(fastProgresserPersona);
    const sunday = isoAdd(t.weeks[9].monday, 6);
    const workouts = useAppStore.getState().workouts.filter((w) => w.date <= sunday);
    const flags = detectStalls(workouts);
    const squat = flags.find((f) => f.exercise === 'Squat');
    const front = flags.find((f) => f.exercise === 'Front Squat');
    expect(squat).toBeDefined();
    expect(front).toBeDefined();
    // Merged, these were one series with identical e1RM evidence.
    expect(squat!.lastE1rmKg).not.toBe(front!.lastE1rmKg);
    expect(squat!.peakE1rmKg).toBeGreaterThan(front!.peakE1rmKg);
    // The flags that remain (17 at week 10, audited session by session)
    // are all readable from the lifts' own histories: the peak sits in
    // block 1 and the block-2 restart (the block-boundary anchoring
    // defect, characterized separately below) keeps the window below it.
    // This count is expected to FALL when that anchoring is fixed.
    expect(flags).toHaveLength(17);
  }, 120000);
});

describe('persona: staller — plateau observation', () => {
  it('bench is held (not progressed) once RPE climbs, from week 4', () => {
    const t = traceFor(stallerPersona);
    const bench = exerciseSeries(t, 'Bench Press');
    const wk4to6 = bench.filter((r) => r.week >= 4 && r.week <= 6);
    expect(wk4to6.every((r) => r.targetBefore.weight === 77.5)).toBe(true);
  });

  it('the stall detector flags bench with a deload suggestion at week 7', () => {
    const t = traceFor(stallerPersona);
    const flag = t.weeks[6].stallFlags.find((f) => f.exercise === 'Bench Press');
    expect(flag).toBeDefined();
    expect(flag!.suggestion).toBe('deload');
  });

  it('the bench plateau proposal APPLIES — its planId names the plan that contains bench', () => {
    // Was [CHARACTERIZATION] before the planId-mapping fix:
    // managedPlanIdByExerciseKey assigned every scheme key to the LAST
    // plan of the block, so this deload_lift proposal carried a planId
    // that did not contain Bench Press and applyPlateauProposal retired
    // it as 'dismissed' (exercise_not_found). The mapping now resolves
    // each lift to the plan whose exercises contain it.
    const t = traceFor(stallerPersona);
    const benchProposals = t.weeks.flatMap((w) =>
      w.plateauProposalsCreated.filter((p) => p.exercise === 'Bench Press')
    );
    expect(benchProposals.length).toBeGreaterThanOrEqual(1);
    expect(benchProposals[0].changeType).toBe('deload_lift');
    expect(benchProposals[0].outcome).toBe('applied');
  });

  it('plateau proposals land across every persona — the wrong-plan dismissal path is gone', () => {
    // Before the mapping fix: 70 of 103 proposals (68%) were dismissed,
    // almost all exercise_not_found under the wrong planId — the applied
    // minority were lifts in the LAST plan of each block. After the fix
    // (probed at the store's apply site): 0 exercise_not_found dismissals
    // remain. The only residual dismissals are the stale-guard retiring a
    // proposal whose target moved under a same-pass variation rename —
    // the guard working as designed ("retire rather than edit blind").
    let created = 0;
    let applied = 0;
    let dismissed = 0;
    for (const p of ALL_PERSONAS) {
      const t = traceFor(p);
      const mine = t.weeks.flatMap((w) => w.plateauProposalsCreated);
      // Proposals must actually land for every persona, not just the ones
      // whose stalled lifts happened to sit in a block's last plan.
      // (Floor recalibrated after the exact-stall-history fix: fewer,
      // realer stall flags produce fewer proposals — 136 created across
      // personas, every one applied, zero dismissed.)
      expect(mine.filter((x) => x.outcome === 'applied').length).toBeGreaterThanOrEqual(10);
      created += mine.length;
      applied += mine.filter((x) => x.outcome === 'applied').length;
      dismissed += mine.filter((x) => x.outcome === 'dismissed').length;
    }
    expect(created).toBeGreaterThanOrEqual(100);
    expect(applied / created).toBeGreaterThanOrEqual(0.95);
    expect(dismissed).toBeLessThanOrEqual(5);
  });

  it('[CHARACTERIZATION] block 2 restarts bench 10 kg below where block 1 left it', () => {
    const t = traceFor(stallerPersona);
    const bench = exerciseSeries(t, 'Bench Press');
    const lastBlock1 = bench.filter((r) => r.date < t.blocks[1].proposedOn).pop();
    const firstBlock2 = bench.find((r) => r.date >= t.blocks[1].proposedOn);
    expect(lastBlock1?.targetBefore.weight).toBe(77.5);
    expect(firstBlock2?.targetBefore.weight).toBe(67.5);
  });

  it('[CHARACTERIZATION] readiness never leaves "primed" through 7 weeks of worst-case check-ins', () => {
    const t = traceFor(stallerPersona);
    const fatigueWeeks = t.sessions.filter((s) => s.week >= 6);
    expect(fatigueWeeks.length).toBeGreaterThan(0);
    for (const s of fatigueWeeks) {
      expect(s.readiness.score).toBeGreaterThanOrEqual(80);
      expect(s.readiness.band).toBe('primed');
    }
  });

  it('the deload-week -10% proposal (BLOCK-DELOAD-01) fires but can never be applied', () => {
    const t = traceFor(stallerPersona);
    const proposals = t.sessions.flatMap((s) =>
      s.exercises.filter((e) => e.decision?.ruleId === 'BLOCK-DELOAD-01')
    );
    expect(proposals.length).toBeGreaterThanOrEqual(2);
    expect(proposals.every((e) => !e.decision!.applied)).toBe(true);
  });

  it('[CHARACTERIZATION] a variation swap still serves a placeholder exercise name ("Dumbbell alternative") in a live plan', () => {
    // Previously pinned as "variation swaps leave one plan containing
    // Leg Press twice": the duplicate was driven by the bogus stall
    // flags from merged exercise histories, and with exact stall
    // history that swap sequence no longer occurs (Leg Press now
    // appears once in this plan). The underlying swap-hygiene defect is
    // still live in the very same snapshot: a plan exercise literally
    // named "Dumbbell alternative" — a placeholder string from the swap
    // table, served as a real exercise. The duplicate-name half of the
    // defect is pinned at unit level in block-engine.test.ts
    // (applyPlateauProposalToPlan performs no collision check).
    const t = traceFor(stallerPersona);
    const lowerB = t.weeks[8].planSnapshot.find((p) => p.planName.includes('Lower B'));
    const names = lowerB!.exercises.map((e) => e.name);
    expect(names.filter((n) => n === 'Leg Press')).toHaveLength(1);
    expect(names).toContain('Dumbbell alternative');
  });

  it('[CHARACTERIZATION] Bulgarian Split Squat is prescribed like a main lift (>= 100 kg)', () => {
    // mainCompoundKey('Bulgarian Split Squat') resolves to 'Squat' via
    // substring matching, so the unilateral accessory inherits the squat
    // e1RM and main-lift loading.
    const t = traceFor(stallerPersona);
    const bulgarian = exerciseSeries(t, 'Bulgarian Split Squat');
    expect(bulgarian[0].targetBefore.weight!).toBeGreaterThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------

describe('stall detector history separation (root-cause probe)', () => {
  function session(date: string, name: string, weight: number, reps: number): WorkoutEntry {
    return {
      id: `probe-${date}-${name}`,
      date,
      exercises: [
        {
          name,
          sets: Array.from({ length: 3 }, () => ({
            reps,
            weight,
            unit: 'kg' as const,
            rpe: 7.5,
            status: 'completed' as const,
            completed: true,
            prescribedWeight: weight,
            prescribedReps: reps,
            prescribedRpe: 8,
            prescribedUnit: 'kg' as const,
          })),
        },
      ],
    };
  }

  it('Squat and Front Squat keep separate histories — no merged series, no phantom flags', () => {
    // Was [CHARACTERIZATION]: detectStalls resolved histories through
    // getExerciseHistorySessions' substring default ('front squat'
    // contains 'squat'), so it saw ONE mixed series for both lifts and
    // flagged both with identical numbers — even though both progressed
    // every week in this fixture. detectStalls now uses exact exercise
    // identity: each lift keeps its own 4 sessions and its own peak,
    // and neither is flagged (both series grew > 2%).
    const workouts = [
      session('2026-01-07', 'Squat', 107.5, 5),
      session('2026-01-10', 'Front Squat', 70, 5),
      session('2026-01-14', 'Squat', 107.5, 6),
      session('2026-01-17', 'Front Squat', 70, 6),
      session('2026-01-21', 'Squat', 110, 4),
      session('2026-01-24', 'Front Squat', 72.5, 4),
      session('2026-01-28', 'Squat', 110, 5),
      session('2026-01-31', 'Front Squat', 72.5, 5),
    ];
    const squatHist = getExerciseHistorySessions('Squat', workouts, 'kg', { exact: true });
    const frontHist = getExerciseHistorySessions('Front Squat', workouts, 'kg', { exact: true });
    expect(squatHist).toHaveLength(4);
    expect(frontHist).toHaveLength(4);
    expect(Math.max(...squatHist.map((s) => s.bestE1RM))).toBeGreaterThan(
      Math.max(...frontHist.map((s) => s.bestE1RM))
    );
    const flags = detectStalls(workouts);
    expect(flags.find((f) => f.exercise === 'Squat')).toBeUndefined();
    expect(flags.find((f) => f.exercise === 'Front Squat')).toBeUndefined();
  });
});

describe('cold start (no fabricated history)', () => {
  const FABRICATIONS = [
    'weeks of showing up',
    'your best',
    'stuck around',
    'last time',
    'previous session',
  ];

  it('week-1 coach takes invent no past performance for any persona', () => {
    for (const p of ALL_PERSONAS) {
      const take = traceFor(p).sessions[0].coachTake ?? '';
      for (const phrase of FABRICATIONS) expect(take).not.toContain(phrase);
    }
  });

  it('[CHARACTERIZATION] the first-ever hypertrophy block claims loads come from "your logged progress"', () => {
    // build_muscle focusReason template: present at cold start for the two
    // hypertrophy personas, absent for the strength template.
    expect(traceFor(painFlarePersona).blocks[0].summary).toContain(
      'where your logged progress has come from'
    );
    expect(traceFor(beginnerPersona).blocks[0].summary).not.toContain(
      'where your logged progress has come from'
    );
  });
});

describe('findings summary (printed for the record)', () => {
  it('prints headline metrics', () => {
    const summary: Record<string, unknown> = {};
    for (const p of ALL_PERSONAS) {
      const t = traceFor(p);
      summary[p.id] = {
        sessions: t.sessions.length,
        appliedProgressions: appliedDecisions(t).length,
        stallFlagsFinalWeek: t.weeks[11].stallFlags.length,
        plateauOutcomes: t.weeks
          .flatMap((w) => w.plateauProposalsCreated)
          .reduce<Record<string, number>>((acc, x) => {
            acc[x.outcome] = (acc[x.outcome] ?? 0) + 1;
            return acc;
          }, {}),
        readinessMin: Math.min(...t.sessions.map((s) => s.readiness.score)),
      };
    }
    console.log('COACH-SIM SUMMARY', JSON.stringify(summary, null, 1));
    expect(Object.keys(summary)).toHaveLength(6);
  });
});
