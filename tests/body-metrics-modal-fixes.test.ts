/**
 * Item-4 fixes (2026-11-05): Body Metrics modal seeding + height
 * suffix, and the dead BUILTIN_SPLIT_TEMPLATES constant.
 *
 * Seeding: the modal's seed effect had `unit` in its deps, so tapping
 * the KG/LBS toggle re-ran the seed AFTER handleUnitToggle had
 * converted every field by hand — discarding the conversions and any
 * typed-but-unsaved edits, snapping the form back to profile/latest
 * values. The seed is now guarded to run once per open (reset on
 * close). These are wiring pins in the style of
 * tests/unit-source-of-truth.test.ts: the vitest harness renders SSR
 * only (effects never fire), so the guard's presence and shape is
 * what can be pinned here; the toggle conversion math itself is
 * covered by tests/units.test.ts.
 *
 * Height suffix: the label switched CM/IN with the entry unit but the
 * input's suffix span hardcoded "CM" — now unit-conditional like the
 * circumference labels.
 *
 * BUILTIN_SPLIT_TEMPLATES was an exported kg-only constant in
 * WorkoutPage.tsx with zero importers anywhere in the repo (src,
 * tests, string refs — grep-verified 2026-11-05). Deleted, together
 * with WorkoutPage's then-unused getGoalAdaptiveSplitTemplates
 * import; the generator itself stays (Onboarding + block-engine use
 * it) — pinned below so the deletion is not misread later.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('BodyMetricsModal seed-once-per-open', () => {
  const modal = read('src/components/BodyMetricsModal.tsx');

  it('guards the seed effect with an open-scoped ref that resets on close', () => {
    expect(modal).toContain('const seededForOpenRef = useRef(false);');
    expect(modal).toContain('if (seededForOpenRef.current) return;');
    expect(modal).toContain('seededForOpenRef.current = true;');
    // Reset happens in the !isOpen branch of the same effect.
    expect(modal).toMatch(/if \(!isOpen\) \{\s*\n\s*seededForOpenRef\.current = false;/);
  });

  it('the unit toggle still converts fields by hand (what the guard protects)', () => {
    expect(modal).toContain('const handleUnitToggle = (newUnit');
    expect(modal).toContain('setWeightInput((kgToLbs(currentVal)).toFixed(1));');
    expect(modal).toContain('setWeightInput((lbsToKg(currentVal)).toFixed(1));');
  });
});

describe('BodyMetricsModal height suffix', () => {
  const modal = read('src/components/BodyMetricsModal.tsx');

  it('renders the suffix from the entry unit, like the label above it', () => {
    expect(modal).toContain("{unit === 'lbs' ? 'IN' : 'CM'}");
    // The old hardcoded suffix span is gone.
    expect(modal).not.toMatch(/-translate-y-1\/2 text-xs font-mono text-text-muted uppercase">\s*\n\s*CM\s*\n\s*<\/span>/);
  });
});

describe('BUILTIN_SPLIT_TEMPLATES deletion', () => {
  it('no reference remains anywhere in src or tests', () => {
    const hits: string[] = [];
    const self = path.join(process.cwd(), 'tests/body-metrics-modal-fixes.test.ts');
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (full === self) continue; // this file names the needle by design
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          if (fs.readFileSync(full, 'utf8').includes('BUILTIN_SPLIT_TEMPLATES')) {
            hits.push(path.relative(process.cwd(), full));
          }
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));
    walk(path.join(process.cwd(), 'tests'));
    expect(hits).toEqual([]);
  });

  it('WorkoutPage no longer imports the generator, but real callers still use it', () => {
    const page = read('src/components/WorkoutPage.tsx');
    expect(page).not.toContain('getGoalAdaptiveSplitTemplates');
    expect(read('src/components/Onboarding.tsx')).toContain('getGoalAdaptiveSplitTemplates');
    expect(read('src/lib/block-engine.ts')).toContain('getGoalAdaptiveSplitTemplates');
  });
});
