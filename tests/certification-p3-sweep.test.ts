import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { useStore } from '@/lib/store';
import { getLocalTodayStr } from '@/lib/formatters';
import { calculateMealMacros } from '@/lib/macros';
import {
  isBlankFoodRow,
  addFoodToBuilderRows,
  builderCountableFoods,
} from '@/lib/meal-builder';
import { isBaselinePR, selectWeeklyRecapPRs } from '@/lib/weekly-recap';
import type { FoodItem, PersonalRecord } from '@/lib/types';

/**
 * Certification Round 2d-1 — functional P3 sweep regression pins.
 * Findings F1/F2/F5/F6/F7/F8 + DB-02 from docs/final-audit/
 * functional-test-results.md and database-integrity.md (branch
 * audit/final-certification-2026-11), all reproduced against master
 * 62e25543 in round 1b-2. Logic-level tests for the extracted lib
 * rules (F7/F8/DB-02); source pins for the UI wiring (F1/F2/F5/F6),
 * following the repo's source-pin precedent (chip-row-wrap.test.ts).
 */

function src(rel: string): string {
  return readFileSync(join(process.cwd(), 'src', rel), 'utf8');
}

// ── DB-02: creatine supply default day key is LOCAL, not UTC ─────────

describe('DB-02 — creatine supply default uses the local day key', () => {
  it('the store default lastUpdated equals getLocalTodayStr()', () => {
    expect(useStore.getState().creatineSupply.lastUpdated).toBe(getLocalTodayStr());
  });

  it('store.ts no longer stamps the default with a UTC day key', () => {
    const s = src('lib/store.ts');
    const block = s.slice(s.indexOf('DEFAULT_CREATINE_SUPPLY'));
    const blockEnd = block.indexOf('};');
    expect(block.slice(0, blockEnd)).toContain('lastUpdated: getLocalTodayStr()');
    expect(block.slice(0, blockEnd)).not.toMatch(/lastUpdated:\s*new Date\(\)\.toISOString/);
  });
});

// ── F7: builder blank-row rules ──────────────────────────────────────

const BLANK: FoodItem = { name: '', quantity: undefined, unit: 'g', calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
const PANEER_100: FoodItem = { name: 'Paneer', quantity: 100, unit: 'g', calories: 265, proteinG: 18.3, carbsG: 4.5, fatG: 20.8 };
const PANEER_200: FoodItem = { name: 'Paneer', quantity: 200, unit: 'g', calories: 530, proteinG: 36.6, carbsG: 9.0, fatG: 41.6 };

describe('F7 — meal builder blank-row rules', () => {
  it('a row with no food chosen is blank (whitespace counts as blank)', () => {
    expect(isBlankFoodRow(BLANK)).toBe(true);
    expect(isBlankFoodRow({ ...BLANK, name: '   ' })).toBe(true);
    expect(isBlankFoodRow(PANEER_100)).toBe(false);
  });

  it('adding a food fills the blank template row instead of stacking a second block', () => {
    const rows = addFoodToBuilderRows([BLANK], PANEER_100);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Paneer');
  });

  it('adding a food appends when no blank row exists', () => {
    const rows = addFoodToBuilderRows([PANEER_100], { ...PANEER_100, name: 'Dal' });
    expect(rows).toHaveLength(2);
    expect(rows[1].name).toBe('Dal');
  });

  it('a blank row carrying a quantity contributes nothing to the totals', () => {
    // The audited state: quantity typed onto the blank template row
    // next to one real 200 g paneer. Total must be the paneer alone
    // (530 / 36.6) — never the phantom 795 the sheet displayed.
    const blankWithQty: FoodItem = { ...BLANK, quantity: 200 };
    const totals = calculateMealMacros(builderCountableFoods([blankWithQty, PANEER_200]));
    expect(totals.calories).toBe(530);
    expect(totals.proteinG).toBe(36.6);
  });

  it('the audited flow end-to-end: open builder, quick-add, the total is one item', () => {
    // Open = [blank]; quick-add favorite fills it (no second block).
    const rows = addFoodToBuilderRows([BLANK], PANEER_200);
    const totals = calculateMealMacros(builderCountableFoods(rows));
    expect(rows).toHaveLength(1);
    expect(totals.calories).toBe(530);
  });
});

// ── F8: weekly recap PR selection ────────────────────────────────────

const WEEK_START = '2026-11-02'; // Monday
const WEEK_END = '2026-11-08'; // Sunday

function pr(partial: Partial<PersonalRecord> & { exercise: string }): PersonalRecord {
  return {
    id: `pr-${Math.random().toString(36).slice(2, 9)}`,
    weightKg: 0,
    weightLbs: 0,
    reps: 0,
    oneRepMax: 0,
    date: '2026-11-04',
    ...partial,
  };
}

describe('F8 — weekly recap PR selection matches the PR store', () => {
  // The exact audited state (J9): 5 session-1 baseline records + the
  // session-2 all-time Bench PR. The card claimed "3 NEW PRS" and
  // highlighted the superseded Bench 22.5×6 baseline.
  const auditedStore: PersonalRecord[] = [
    pr({ exercise: 'Bench Press', weightKg: 22.5, weightLbs: 49.6, reps: 6, oneRepMax: 27.0, notes: 'Baseline established from first session', prType: '1rm' }),
    pr({ exercise: 'Barbell Row', weightKg: 15, weightLbs: 33.1, reps: 8, oneRepMax: 19.0, notes: 'Baseline established from first session', prType: '1rm' }),
    pr({ exercise: 'Overhead Press', weightKg: 10, weightLbs: 22.0, reps: 10, oneRepMax: 13.3, notes: 'Baseline established from first session', prType: '1rm' }),
    pr({ exercise: 'Lat Pulldown', weightKg: 30, weightLbs: 66.1, reps: 8, oneRepMax: 38.0, notes: 'Baseline established from first session', prType: '1rm' }),
    pr({ exercise: 'Tricep Pushdown', weightKg: 15, weightLbs: 33.1, reps: 10, oneRepMax: 20.0, notes: 'Baseline established from first session', prType: '1rm' }),
    pr({ exercise: 'Bench Press', weightKg: 25, weightLbs: 55.1, reps: 5, oneRepMax: 29.2, notes: 'All-Time 1RM PR', prType: '1rm' }),
  ];

  it('baselines are baselines by flag OR by notes (the PR page rule)', () => {
    expect(isBaselinePR(auditedStore[0])).toBe(true);
    expect(isBaselinePR(pr({ exercise: 'Squat', isBaseline: true }))).toBe(true);
    expect(isBaselinePR(auditedStore[5])).toBe(false);
  });

  it('the audited week counts 1 new PR, not 3, and highlights the all-time Bench', () => {
    const { count, highlights } = selectWeeklyRecapPRs(auditedStore, WEEK_START, WEEK_END);
    expect(count).toBe(1);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].exercise).toBe('Bench Press');
    expect(highlights[0].weightKg).toBe(25);
    expect(highlights[0].reps).toBe(5);
  });

  it('count is never capped by the 3 highlight rows', () => {
    const many: PersonalRecord[] = [
      pr({ exercise: 'Squat', oneRepMax: 140, notes: 'All-Time 1RM PR' }),
      pr({ exercise: 'Bench Press', oneRepMax: 100, notes: 'All-Time 1RM PR', date: '2026-11-02' }),
      pr({ exercise: 'Bench Press', oneRepMax: 105, notes: 'All-Time 1RM PR', date: '2026-11-04' }),
      pr({ exercise: 'Deadlift', oneRepMax: 180, notes: 'All-Time 1RM PR' }),
      pr({ exercise: 'Overhead Press', oneRepMax: 60, notes: 'Rep PR: +2 reps at 50 kg', prType: 'reps' }),
    ];
    const { count, highlights } = selectWeeklyRecapPRs(many, WEEK_START, WEEK_END);
    expect(count).toBe(5);
    expect(highlights).toHaveLength(3);
    // Best per exercise, strongest first; Bench shows the superseding 105.
    expect(highlights.map((h) => h.exercise)).toEqual(['Deadlift', 'Squat', 'Bench Press']);
    expect(highlights[2].oneRepMax).toBe(105);
  });

  it('records outside the week are excluded', () => {
    const outside: PersonalRecord[] = [
      pr({ exercise: 'Squat', oneRepMax: 140, notes: 'All-Time 1RM PR', date: '2026-10-26' }),
      pr({ exercise: 'Squat', oneRepMax: 150, notes: 'All-Time 1RM PR', date: '2026-11-09' }),
    ];
    const { count, highlights } = selectWeeklyRecapPRs(outside, WEEK_START, WEEK_END);
    expect(count).toBe(0);
    expect(highlights).toHaveLength(0);
  });
});

// ── F1/F2/F5/F6: UI wiring pins ──────────────────────────────────────

describe('F1 — onboarding holds name + gender in the parent across remounts', () => {
  const s = src('components/Onboarding.tsx');

  it('handleFinishCalibration writes the submitted name and gender back to parent state', () => {
    expect(s).toContain('setAthleteName(details.name)');
    expect(s).toContain('setDetailsGender(details.gender)');
  });

  it('the details screen re-seeds gender from that state, not the constant', () => {
    expect(s).toContain('initialGender={detailsGender}');
    expect(s).not.toContain('initialGender={gender}');
  });
});

describe('F2 — the designed name-required error can actually render', () => {
  const s = src('components/onboarding/PersonalDetailsScreen.tsx');

  it('the details form opts out of native validation', () => {
    expect(s).toContain('noValidate');
  });

  it('#details-name carries no native required attribute (aria-required keeps the semantics)', () => {
    const start = s.indexOf('id="details-name"');
    const tag = s.slice(start, s.indexOf('/>', start));
    expect(tag).not.toMatch(/\srequired[\s/]/);
    expect(tag).toContain('aria-required="true"');
  });
});

describe('F5 — draft discard is confirm-gated', () => {
  const s = src('components/WorkoutPage.tsx');

  it('the banner Discard opens the confirmation instead of discarding directly', () => {
    expect(s).toContain('setIsDraftDiscardConfirmOpen(true)');
    expect(s).not.toContain('onClick={handleDiscardDraft}');
  });

  it('a ConfirmationModal wired to the discard handler renders the draft copy', () => {
    expect(s).toContain("t('train.discardDraftTitle')");
    expect(s).toContain('isDraftDiscardConfirmOpen');
  });
});

describe('F6 — the meal-name requirement is visible before the save attempt', () => {
  const s = src('components/MealsPage.tsx');

  it('the sheet renders the persistent name-required hint', () => {
    expect(s).toContain("t('meals.mealNameRequiredHint')");
  });

  it('Save is disabled while the meal name is missing', () => {
    expect(s).toContain('nameMissing');
    expect(s).toMatch(/disabled=\{[^}]*nameMissing/);
  });

  it('the name field itself is marked required', () => {
    const start = s.indexOf('id="meal-builder-name"');
    const tag = s.slice(start, s.indexOf('/>', start));
    expect(tag).toContain('aria-required="true"');
  });
});
