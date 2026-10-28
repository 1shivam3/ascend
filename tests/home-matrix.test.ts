import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getDaySummary,
  mondayOfWeek,
  monthGrid,
  toDateStr,
  weekDays,
  type MatrixInputs,
} from '../src/lib/home-matrix';
import { sanitizeUiPreferences } from '../src/lib/store';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const inputs: MatrixInputs = {
  workouts: [
    { id: 'w1', date: '2026-10-26', exercises: [{ name: 'Bench Press', sets: [{ reps: 10, unit: 'kg' }, { reps: 8, unit: 'kg' }] }] },
    { id: 'w2', date: '2026-10-26T08:00:00', exercises: [] },
  ] as never,
  meals: [
    {
      id: 'm1',
      date: '2026-10-26',
      name: 'Lunch',
      foods: [
        { name: 'Eggs', calories: 155, proteinG: 13, carbsG: 1, fatG: 11 },
        { name: 'Rice', calories: 200, proteinG: 4, carbsG: 44, fatG: 1 },
      ],
    },
    { id: 'm2', date: '2026-10-27', name: 'Snack', foods: [{ name: 'Curd', calories: 100, proteinG: 5, carbsG: 6, fatG: 4 }] },
  ] as never,
  waterLogs: { '2026-10-26': 2400, '2026-10-27': 500 },
  creatineLogs: { '2026-10-26': { taken: true } } as never,
  waterTargetMl: 2650,
  proteinTargetG: 126,
  showCreatine: true,
};

describe('getDaySummary — per-date aggregation', () => {
  it('a full day returns its workouts, meals, macros, and done habits', () => {
    const s = getDaySummary('2026-10-26', inputs);
    expect(s.workouts.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(s.meals.map((m) => m.id)).toEqual(['m1']);
    expect(s.macros).toEqual({ calories: 355, proteinG: 17, carbsG: 45, fatG: 12 });
    const done = Object.fromEntries(s.habits.map((h) => [h.id, h.done]));
    expect(done).toEqual({ workout: true, water: true, creatine: true, protein: false });
    expect(s.empty).toBe(false);
  });

  it('an empty day returns empty lists, zero macros, undone habits', () => {
    const s = getDaySummary('2026-10-28', inputs);
    expect(s.workouts).toEqual([]);
    expect(s.meals).toEqual([]);
    expect(s.macros).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    expect(s.habits.every((h) => !h.done)).toBe(true);
    expect(s.empty).toBe(true);
  });

  it('a day with a small meal is not empty even when no habit is done', () => {
    const s = getDaySummary('2026-10-27', inputs);
    expect(s.meals.map((m) => m.id)).toEqual(['m2']);
    expect(s.empty).toBe(false);
    expect(s.habits.find((h) => h.id === 'protein')?.done).toBe(false);
    expect(s.habits.find((h) => h.id === 'water')?.done).toBe(false);
  });

  it('creatine row is omitted when creatine tracking is hidden', () => {
    const s = getDaySummary('2026-10-26', { ...inputs, showCreatine: false });
    expect(s.habits.map((h) => h.id)).toEqual(['workout', 'water', 'protein']);
  });

  it('water counts at >= 85% of target, protein the same', () => {
    const s = getDaySummary('2026-10-26', { ...inputs, waterLogs: { '2026-10-26': 2253 } });
    expect(s.habits.find((h) => h.id === 'water')?.done).toBe(true);
    const below = getDaySummary('2026-10-26', { ...inputs, waterLogs: { '2026-10-26': 2252 } });
    expect(below.habits.find((h) => h.id === 'water')?.done).toBe(false);
  });
});

describe('week / month helpers (Monday-first)', () => {
  it('mondayOfWeek maps Wed 2026-10-28 to Mon 2026-10-26', () => {
    expect(toDateStr(mondayOfWeek(new Date(2026, 9, 28)))).toBe('2026-10-26');
  });

  it('weekDays returns 7 Mon–Sun dates', () => {
    const days = weekDays(mondayOfWeek(new Date(2026, 9, 28)));
    expect(days).toHaveLength(7);
    expect(days.map(toDateStr)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('monthGrid for October 2026: 5 weeks, Thu Oct 1 after 3 blanks', () => {
    const weeks = monthGrid(2026, 9);
    expect(weeks).toHaveLength(5);
    expect(weeks[0].map((d) => (d ? toDateStr(d) : null))).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weeks[4].map((d) => (d ? toDateStr(d) : null))).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      null,
    ]);
  });

  it('monthGrid for February 2026 (non-leap, Sun Feb 1): 6 blanks first', () => {
    const weeks = monthGrid(2026, 1);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][6] ? toDateStr(weeks[0][6] as Date) : null).toBe('2026-02-01');
    expect(weeks[0].slice(0, 6).every((d) => d === null)).toBe(true);
  });
});

describe('defaultMatrixView persistence (sanitize)', () => {
  it('missing field resolves to weekly', () => {
    const out = sanitizeUiPreferences({}, false) as Record<string, unknown>;
    expect(out.defaultMatrixView).toBe('weekly');
  });

  it('stored monthly is honored', () => {
    const out = sanitizeUiPreferences({ defaultMatrixView: 'monthly' }, false) as Record<string, unknown>;
    expect(out.defaultMatrixView).toBe('monthly');
  });

  it('invalid value falls back to weekly', () => {
    const out = sanitizeUiPreferences({ defaultMatrixView: 'yearly' }, false) as Record<string, unknown>;
    expect(out.defaultMatrixView).toBe('weekly');
  });
});

describe('FAQ content presence (en + hi)', () => {
  const qs = [1, 2, 3, 4, 5, 6, 7];
  it('all 7 questions and answers exist in both languages', () => {
    for (const n of qs) {
      const q = `settings.faqQ${n}` as keyof typeof en;
      const a = `settings.faqA${n}` as keyof typeof en;
      expect(en[q]).toBeTruthy();
      expect(en[a]).toBeTruthy();
      expect(hi[q as keyof typeof hi]).toBeTruthy();
      expect(hi[a as keyof typeof hi]).toBeTruthy();
    }
  });

  it('every answer is 1–2 plain sentences', () => {
    for (const n of qs) {
      for (const dict of [en, hi]) {
        const text = String(dict[`settings.faqA${n}` as keyof typeof dict]);
        const sentences = text.split(/[.!?।]+/).map((s) => s.trim()).filter(Boolean);
        expect(sentences.length).toBeGreaterThanOrEqual(1);
        expect(sentences.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('matrix + default-view strings exist in both languages', () => {
    const keys = [
      'homeMatrix.title',
      'homeMatrix.weekly',
      'homeMatrix.monthly',
      'homeMatrix.today',
      'homeMatrix.workout',
      'homeMatrix.water',
      'homeMatrix.creatine',
      'homeMatrix.protein',
      'homeMatrix.emptyDay',
      'settings.defaultMatrixView',
      'settings.defaultMatrixViewHint',
      'settings.faqTitle',
      'settings.faqHint',
    ] as const;
    for (const k of keys) {
      expect(en[k]).toBeTruthy();
      expect(hi[k as keyof typeof hi]).toBeTruthy();
    }
  });
});

describe('HowToUseGuide is fully removed', () => {
  const root = process.cwd();
  it('component, lib, and dedicated test files are gone', () => {
    expect(fs.existsSync(path.join(root, 'src/components/HowToUseGuide.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/lib/howto-guide.ts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'tests/howto-guide-flag.test.ts'))).toBe(false);
  });

  it('no remaining references in page, Settings, Onboarding, or store', () => {
    const banned = ['HowToUseGuide', 'clearHowToSeenFlag', 'HOWTO_SEEN_KEY', 'howto-guide'];
    for (const file of [
      'src/app/page.tsx',
      'src/components/SettingsView.tsx',
      'src/components/Onboarding.tsx',
      'src/lib/store.ts',
    ]) {
      const text = fs.readFileSync(path.join(root, file), 'utf-8');
      for (const token of banned) {
        expect(text).not.toContain(token);
      }
    }
  });
});
