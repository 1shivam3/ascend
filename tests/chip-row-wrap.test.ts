import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Fix-everything pass: filter/chip rows must WRAP, not hide behind a
 * scrollbar nobody can see. Live-verified on production (2026-10-27):
 * the Progress Habit Matrix filter row's last chip ("Protein") was cut
 * off at the card edge, reading only "Pro", because the row was
 * `overflow-x-auto` with the scrollbar hidden (`no-scrollbar` /
 * `scrollbar-none`) — on desktop there is no affordance to scroll it.
 * The fix converts every fixed, small chip set to `flex-wrap` (the
 * pattern the Settings section chips already use); the row then shows
 * every chip at every width instead of clipping the last one.
 *
 * Source-level test, following the F19 wiring-test precedent: it pins
 * the class strings so a future edit cannot silently reintroduce the
 * hidden-scroll row. Live rendering still needs a browser check.
 *
 * Deliberate exceptions (NOT converted, by design):
 * - LogPastWorkoutModal template selector: an UNBOUNDED user-plan
 *   list — horizontal scroll is the correct pattern there, not a
 *   many-row wrap.
 * - PlateCalculatorModal quick steps: inner groups are `flex-1`, so
 *   the row fills its container by construction and cannot clip.
 * - WeeklyScheduleModal presets bar: a header strip whose 4 short
 *   buttons fit at desktop widths (where the defect was verified);
 *   wrapping a sticky header would change its layout contract.
 */
function src(rel: string): string {
  return readFileSync(join(process.cwd(), 'src', rel), 'utf8');
}

const FIXED_FILES = [
  'components/WorkoutHeatmap.tsx',
  'components/ExerciseLibraryModal.tsx',
  'components/PRsPage.tsx',
  'components/PolicyDecisionLedger.tsx',
  'components/ExerciseSelectorModal.tsx',
  'components/ProgressChart.tsx',
];

const EXCEPTION_FILES = [
  'components/LogPastWorkoutModal.tsx',
  'components/PlateCalculatorModal.tsx',
  'components/WeeklyScheduleModal.tsx',
];

describe('chip-row wrap: no hidden-scrollbar filter rows', () => {
  it('the reported Progress filter row wraps (WorkoutHeatmap)', () => {
    const s = src('components/WorkoutHeatmap.tsx');
    expect(s).not.toContain('overflow-x-auto');
    expect(s).toContain('flex flex-wrap items-center gap-1.5 pb-1 text-xs');
  });

  it('every other fixed chip set wraps', () => {
    const expectations: Record<string, string[]> = {
      'components/ExerciseLibraryModal.tsx': [
        'flex flex-wrap items-center gap-1.5 pb-0.5',
        'flex flex-wrap items-center gap-1.5',
      ],
      'components/PRsPage.tsx': ['flex flex-wrap items-center gap-1.5 pb-1'],
      'components/PolicyDecisionLedger.tsx': ['flex flex-wrap items-center gap-1.5 pb-1'],
      'components/ExerciseSelectorModal.tsx': ['flex flex-wrap items-center gap-1.5 pb-1 text-2xs'],
      'components/ProgressChart.tsx': ['flex flex-wrap gap-1.5 pb-1'],
    };
    for (const [file, snippets] of Object.entries(expectations)) {
      const s = src(file);
      expect(s, `${file} must not use horizontal scroll for chips`).not.toContain('overflow-x-auto');
      for (const snippet of snippets) {
        expect(s, `${file} must contain ${snippet}`).toContain(snippet);
      }
    }
  });

  it('no NEW hidden-scrollbar chip row appears anywhere in components', () => {
    const offenders: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(join(dir, entry.name), rel);
        } else if (entry.name.endsWith('.tsx')) {
          const text = readFileSync(join(dir, entry.name), 'utf8');
          const hiddenScroll = text
            .split('\n')
            .some(
              (l) =>
                l.includes('overflow-x-auto') &&
                (l.includes('no-scrollbar') || l.includes('scrollbar-none')),
            );
          if (hiddenScroll) offenders.push(`components/${rel}`);
        }
      }
    };
    walk(join(process.cwd(), 'src', 'components'), '');
    expect(offenders.sort()).toEqual(EXCEPTION_FILES.map((f) => f).sort());
  });

  it('fixed files contain no overflow-x-auto at all (they had no other use)', () => {
    for (const file of FIXED_FILES) {
      expect(src(file), `${file} must not contain overflow-x-auto`).not.toContain('overflow-x-auto');
    }
  });
});
