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
import { runSimulation, type PersonaDef, type SimTrace } from './coach-sim-harness';
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
import { getMovementFamily, isPlaceholderSubstitute } from '@/lib/workout-engine';
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
        if (
          decision.actionCategory !== 'candidate_rep_progression' &&
          decision.actionCategory !== 'candidate_load_progression'
        ) {
          continue; // deload reductions are bounded by their own test below
        }
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

  it('load REDUCTIONS apply only as athlete-confirmed BLOCK-DELOAD-01 cuts', () => {
    // Was [CHARACTERIZATION]: reductions could never apply at all —
    // BLOCK-DELOAD-01 was emitted as review_required and the application
    // validator rejected both that category and any negative delta, so
    // 263 sessions produced zero applied reductions. The deload proposal
    // is now a candidate_load_reduction that the validator admits only
    // for BLOCK-DELOAD-01 and only after the athlete accepts it; the
    // harness's engaged user confirms it through the same decision-card
    // path as progressions.
    let totalReductions = 0;
    for (const p of ALL_PERSONAS) {
      const reductions = appliedDecisions(traceFor(p)).filter(
        ({ decision }) => decision.deltaWeight < 0
      );
      for (const { decision } of reductions) {
        expect(decision.ruleId).toBe('BLOCK-DELOAD-01');
        expect(decision.actionCategory).toBe('candidate_load_reduction');
        expect(decision.deltaReps).toBe(0);
      }
      totalReductions += reductions.length;
    }
    // The staller's two deload weeks (see his suite) guarantee the path
    // is genuinely exercised, not vacuously satisfied.
    expect(totalReductions).toBeGreaterThanOrEqual(2);
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

  it('readiness drops materially through the pain weeks — flagged areas move the score', () => {
    // Was [CHARACTERIZATION]: readiness stayed >= 90 ('primed')
    // through weeks 5-7 because calculateReadiness read only the
    // freshness NUMBER and ignored painAreas/soreAreas entirely —
    // a shoulder-pain report moved the score by 0 (observed 96/100
    // mid-flare). The score now prices the areas (pain −15 and a cap
    // below 'primed'; sore areas −3 each, capped −6), so every
    // pain-week session lands materially below this persona's own
    // pain-free floor and never reads 'primed'.
    const t = traceFor(painFlarePersona);
    const painWeeks = t.sessions.filter((s) => s.week >= 5 && s.week <= 7);
    const baselineWeeks = t.sessions.filter((s) => s.week <= 4);
    expect(painWeeks.length).toBeGreaterThan(0);
    const baselineFloor = Math.min(...baselineWeeks.map((s) => s.readiness.score));
    for (const s of painWeeks) {
      expect(s.readiness.score).toBeLessThanOrEqual(79);
      expect(s.readiness.band).not.toBe('primed');
      expect(s.readiness.score).toBeLessThanOrEqual(baselineFloor - 10);
    }
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

  it('a lifter who progresses every week ends with (almost) no stall flags', () => {
    // Joint proof of the exact-history fix and the block-boundary
    // continuity fix. Pre-stack, this persona collected 12 stall flags
    // at week 10: some carried another lift's numbers fused into the
    // evidence (substring-merged histories — the separation probe below
    // pins that fix directly), and the rest were manufactured by block
    // restarts resetting his loads below his demonstrated level, so
    // every detection window peaked in the previous block. With exact
    // histories and continuous block loads, the detector — unchanged —
    // finds almost nothing left to flag: he progresses every week, and
    // now the record says so (weeks 10/11 carry a single flag each,
    // week 12 none).
    const t = traceFor(fastProgresserPersona);
    expect(t.weeks[9].stallFlags.length).toBeLessThanOrEqual(1);
    expect(t.weeks[11].stallFlags).toHaveLength(0);
  });
});

describe('persona: staller — plateau observation', () => {
  it('bench is held (not progressed) once RPE climbs, from week 4', () => {
    const t = traceFor(stallerPersona);
    const bench = exerciseSeries(t, 'Bench Press');
    // Weeks 4-5 sit at 77.5; the week-5 deload session's confirmed
    // BLOCK-DELOAD-01 cut lands on the plan, so the week-6 test session
    // is prescribed the reduced 69.75 — a hold would read 77.5 here.
    const wk4to5 = bench.filter((r) => r.week >= 4 && r.week <= 5);
    expect(wk4to5.every((r) => r.targetBefore.weight === 77.5)).toBe(true);
    const wk6 = bench.filter((r) => r.week === 6);
    expect(wk6.every((r) => r.targetBefore.weight === 69.75)).toBe(true);
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
    // remain; the only dismissals ever seen since are the stale-guard
    // retiring a proposal whose target moved under a same-pass variation
    // rename — the guard working as designed ("retire rather than edit
    // blind") — and with the full fix stack landed, the current runs
    // produce zero dismissals at all.
    let created = 0;
    let applied = 0;
    let dismissed = 0;
    for (const p of ALL_PERSONAS) {
      const t = traceFor(p);
      const mine = t.weeks.flatMap((w) => w.plateauProposalsCreated);
      // Proposals must actually land for every persona, not just the ones
      // whose stalled lifts happened to sit in a block's last plan.
      // (Floor recalibrated across the fix stack: as the exact-history
      // and block-continuity fixes landed, the bogus-flag cascade dried
      // up and proposal creation fell 157 -> 136 -> 45 across personas.
      // The landing guarantee is what this test protects: of the 45 now
      // created, every one applies and zero are dismissed.)
      expect(mine.filter((x) => x.outcome === 'applied').length).toBeGreaterThanOrEqual(2);
      created += mine.length;
      applied += mine.filter((x) => x.outcome === 'applied').length;
      dismissed += mine.filter((x) => x.outcome === 'dismissed').length;
    }
    expect(created).toBeGreaterThanOrEqual(40);
    expect(applied / created).toBeGreaterThanOrEqual(0.95);
    expect(dismissed).toBeLessThanOrEqual(5);
  });

  it('block 2 starts bench at the demonstrated level — no anchoring discount', () => {
    // Was [CHARACTERIZATION]: block 2 restarted bench at 67.5 kg, 10 kg
    // below block 1's final 77.5 kg, because generateBlockProposal
    // re-anchored to estimated-e1RM x focus % (0.76) and ignored the
    // demonstrated working load. The demonstrated-capacity floor now
    // converts his best recent bench e1RM at the new block's reps —
    // the restart discount is gone. (Block 1's last working
    // prescription is 69.75 because the athlete confirmed the week-5
    // deload cut; the floor correctly anchors block 2 to what he
    // demonstrated at 77.5, not to the deload week's reduced load.)
    const t = traceFor(stallerPersona);
    const bench = exerciseSeries(t, 'Bench Press');
    const lastBlock1 = bench.filter((r) => r.date < t.blocks[1].proposedOn).pop();
    const firstBlock2 = bench.find((r) => r.date >= t.blocks[1].proposedOn);
    expect(lastBlock1?.targetBefore.weight).toBe(69.75);
    expect(firstBlock2?.targetBefore.weight).toBe(77.5);
  });

  it('no lift in any persona restarts a block more than 7% below its previous block-end level (e1RM terms)', () => {
    // The pre-fix measurement (raw loads) ran -3.2% to -20% on EVERY
    // lift at EVERY boundary. Compared in e1RM terms — each side at its
    // own reps, the honest comparison when rep schemes change between
    // blocks — the post-floor residual is loadable-step rounding on
    // light lifts plus two accessories whose block-1 target reps ran
    // ahead of the reps ever demonstrated. The -7% bound leaves that
    // room and no more: any return of the anchoring discount (a main
    // lift restarting 10%+ below its demonstrated level) trips it.
    const e1rm = (w: number, r: number) =>
      r <= 10 ? w * (1 + r / 30) : w * (1 + 10 / 30 + (r - 10) / 45);
    for (const p of ALL_PERSONAS) {
      const t = traceFor(p);
      for (let b = 1; b < t.blocks.length; b++) {
        const boundary = t.blocks[b].proposedOn;
        const names = new Set(t.sessions.flatMap((s) => s.exercises.map((e) => e.name)));
        for (const name of names) {
          const series = t.sessions.flatMap((s) =>
            s.exercises
              .filter(
                (e) =>
                  e.name === name &&
                  typeof e.targetBefore.weight === 'number' &&
                  e.targetBefore.weight > 0
              )
              .map((e) => ({ date: s.date, w: e.targetBefore.weight!, r: e.targetBefore.reps }))
          );
          const lastBefore = series.filter((x) => x.date < boundary).pop();
          const firstAfter = series.find((x) => x.date >= boundary);
          if (!lastBefore || !firstAfter) continue;
          const pct =
            ((e1rm(firstAfter.w, firstAfter.r) - e1rm(lastBefore.w, lastBefore.r)) /
              e1rm(lastBefore.w, lastBefore.r)) *
            100;
          expect(pct, `${p.id} ${name} into block ${b + 1}`).toBeGreaterThanOrEqual(-7);
        }
      }
    }
  });

  it('readiness leaves "primed" once poor check-ins stack up (weeks 7+)', () => {
    // Was [CHARACTERIZATION]: readiness never left 'primed' through
    // seven weeks of sleep/soreness/energy = 2/2/2 check-ins — every
    // day was scored in isolation, so a sustained grind cost the same
    // −11 forever and the score sat at 89. Prior poor check-ins now
    // stack (−4 per poor day among the last 3, cap −12): by week 7
    // every prior check-in is a poor one, and the score settles at 77
    // ('ready') for the rest of the run instead of declaring a wrecked
    // lifter 'primed'.
    const t = traceFor(stallerPersona);
    const grind = t.sessions.filter((s) => s.week >= 7);
    expect(grind.length).toBeGreaterThan(0);
    for (const s of grind) {
      expect(s.readiness.score).toBeLessThan(80);
      expect(s.readiness.band).not.toBe('primed');
    }
    // And the drop is material against his own fresh baseline.
    const fresh = t.sessions.filter((s) => s.week <= 3);
    const freshFloor = Math.min(...fresh.map((s) => s.readiness.score));
    for (const s of grind) expect(s.readiness.score).toBeLessThanOrEqual(freshFloor - 10);
  });

  it('the deload-week -10% proposal (BLOCK-DELOAD-01) fires and the confirmed cut applies', () => {
    // Was a pinned defect: the proposal fired (weeks 5 and 11) but was
    // emitted as review_required, which the application validator
    // rejects by design — zero reductions could ever land. It is now a
    // candidate_load_reduction; the harness's engaged user accepts and
    // applies it through the real decision-card path, and each applied
    // cut is exactly the proposed 10% of the session's target load.
    const t = traceFor(stallerPersona);
    const proposals = t.sessions.flatMap((s) =>
      s.exercises.filter((e) => e.decision?.ruleId === 'BLOCK-DELOAD-01')
    );
    expect(proposals.length).toBeGreaterThanOrEqual(2);
    for (const e of proposals) {
      expect(e.decision!.applied).toBe(true);
      expect(e.decision!.actionCategory).toBe('candidate_load_reduction');
      expect(Math.abs(e.decision!.deltaWeight + 0.1 * (e.targetBefore.weight ?? 0))).toBeLessThan(0.01);
    }
  });

  it('no plan in any persona ever contains a duplicate or placeholder exercise name', () => {
    // Was a pinned defect with two halves: the swap table's generic
    // fallback invented targets literally named 'Dumbbell alternative'
    // (written into the staller's Upper B plan as an exercise), and
    // variation applies had no collision check (a plan held Leg Press
    // twice). Both are fixed at the source — fallbacks return no
    // swaps, detectStalls only offers real library candidates, and
    // proposal creation/apply refuse collisions — so sweep every
    // persona, every week, every plan snapshot.
    for (const p of ALL_PERSONAS) {
      const t = traceFor(p);
      for (const week of t.weeks) {
        for (const plan of week.planSnapshot) {
          const names = plan.exercises.map((e) => e.name);
          expect(
            new Set(names.map((n) => n.trim().toLowerCase())).size,
            `${p.id} wk${week.week} ${plan.planName} has a duplicate exercise`
          ).toBe(names.length);
          for (const n of names) {
            expect(
              isPlaceholderSubstitute(n),
              `${p.id} wk${week.week} ${plan.planName} contains placeholder "${n}"`
            ).toBe(false);
          }
        }
      }
    }
  });

  it('Bulgarian Split Squat is prescribed in its own range, never squat-derived', () => {
    // Was a pinned defect: mainCompoundKey substring-matched 'squat',
    // so the unilateral accessory inherited the barbell squat's e1RM
    // and was prescribed at 107.5→112.5 kg. Compound identity is now
    // canonical — Bulgarian resolves to itself and is loaded as the
    // accessory it is.
    const t = traceFor(stallerPersona);
    const bulgarian = exerciseSeries(t, 'Bulgarian Split Squat');
    expect(bulgarian.length).toBeGreaterThan(0);
    for (const s of bulgarian) {
      expect(s.targetBefore.weight!).toBeLessThan(100);
    }
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
