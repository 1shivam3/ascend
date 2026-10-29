import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * QA4 Wave-2 Batch 10 — source-level regression tests for the
 * touch-target / label / type / jargon / hardening fixes. These pin the
 * exact class/copy strings the audit flagged so a future restyle cannot
 * silently shrink a target or reintroduce jargon.
 */
const read = (rel: string) =>
  readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

describe('QA4-015 touch targets ≥40px in workout flows', () => {
  it('shared Button sm is 44px tall (was 36px)', () => {
    const src = read('src/components/ui/Button.tsx');
    expect(src).toContain("sm: 'text-xs px-3 py-1.5 min-h-[44px] gap-1.5'");
    expect(src).not.toContain('min-h-[36px]');
  });

  it('globals define the tap-40 hit-area utility at exactly 40px', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('.tap-40::before');
    expect(css).toContain('width: 40px');
    expect(css).toContain('height: 40px');
  });

  it('VoiceWorkoutLoggerModal steppers are 44px (were 24px)', () => {
    const src = read('src/components/VoiceWorkoutLoggerModal.tsx');
    expect(src).not.toContain('w-6 h-6 rounded bg-bg-secondary');
    expect(src).toContain('w-10 h-10 min-w-[44px] min-h-[44px]');
    // RPE pills reach 44px tall too (label floor: text-3xs retired by
    // the UX redesign, now text-2xs at 11px)
    expect(src).toContain('py-2 min-h-[44px] rounded text-2xs font-mono font-bold');
  });

  it('SuggestedWorkoutModal steppers carry the tap-40 hit area (were 28px)', () => {
    const src = read('src/components/SuggestedWorkoutModal.tsx');
    expect(src).not.toContain('className="w-7 h-7 flex items-center justify-center rounded text-text-muted');
    expect(src).toContain('w-7 h-7 tap-40 flex items-center justify-center');
  });

  it('ActiveWorkoutScreen header buttons are 44px (were 32px)', () => {
    const src = read('src/components/ActiveWorkoutScreen.tsx');
    expect(src).not.toContain('className="w-8 h-8 rounded-lg bg-bg-secondary hover:bg-bg-tertiary');
    expect(src).toContain('w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-bg-secondary hover:bg-bg-tertiary');
    // Skip-set chip in the RPE row: 36 -> 44 (label floor: text-3xs
    // retired by the UX redesign, now text-2xs at 11px)
    expect(src).not.toContain('py-2 min-h-[36px] rounded-lg text-2xs');
    expect(src).toContain('py-2 min-h-[44px] rounded-lg text-2xs');
    // Discard button: 36 -> 40
    expect(src).not.toContain('min-h-[36px] min-w-[36px]');
  });

  it('modal X closes use a 44px minimum hit area across the modal set', () => {
    const files = [
      'src/components/BarcodeScannerModal.tsx',
      'src/components/BodyMetricsModal.tsx',
      'src/components/ConstraintAdapterModal.tsx',
      'src/components/CreatineModal.tsx',
      'src/components/ExerciseLibraryModal.tsx',
      'src/components/ExerciseSelectorModal.tsx',
      'src/components/GoalSelectorModal.tsx',
      'src/components/HydrationModal.tsx',
      'src/components/ImportProgramModal.tsx',
      'src/components/PlateCalculatorModal.tsx',
      'src/components/ScanMealModal.tsx',
      'src/components/ShareProgramModal.tsx',
      'src/components/SuggestedWorkoutModal.tsx',
      'src/components/VoiceWorkoutLoggerModal.tsx',
      'src/components/WeeklyRecapModal.tsx',
      'src/components/WeeklyScheduleModal.tsx',
    ];
    for (const f of files) {
      expect(read(f), f).toContain('min-h-[44px] min-w-[44px]');
    }
  });
});

describe('QA4-020 remainder — label association + keyboard activation', () => {
  it('EditProfileModal labels are associated (htmlFor/id or aria-labelledby groups)', () => {
    const src = read('src/components/EditProfileModal.tsx');
    for (const id of ['edit-profile-name', 'edit-profile-age', 'edit-profile-weight', 'edit-profile-height']) {
      expect(src).toContain(`htmlFor="${id}"`);
      expect(src).toContain(`id="${id}"`);
    }
    // Gender / Units are button groups: named via aria-labelledby spans
    expect(src).toContain('id="edit-profile-gender-label"');
    expect(src).toContain('aria-labelledby="edit-profile-gender-label"');
    expect(src).toContain('id="edit-profile-units-label"');
    expect(src).toContain('aria-labelledby="edit-profile-units-label"');
    // No bare unassociated <label> remains in the form
    expect(src).not.toMatch(/<label className=/);
  });

  it('ScanMealModal labels are associated, including per-item editor ids', () => {
    const src = read('src/components/ScanMealModal.tsx');
    expect(src).toContain('htmlFor="scan-meal-notes"');
    expect(src).toContain('id="scan-meal-notes"');
    expect(src).toContain('htmlFor="scan-meal-name"');
    expect(src).toContain('id="scan-meal-name"');
    for (const field of ['name', 'grams', 'calories', 'protein', 'carbs', 'fat']) {
      expect(src).toContain(`htmlFor={\`scan-edit-${field}-\${idx}\`}`);
      expect(src).toContain(`id={\`scan-edit-${field}-\${idx}\`}`);
    }
    expect(src).not.toMatch(/<label className=/);
  });

  it('HomePage nutrition + protein cards are keyboard-activatable like the challenges card', () => {
    const src = read('src/components/HomePage.tsx');
    const keyHandlers = src.match(/onKeyDown=\{\(e\) => \{\s*if \(e\.key === 'Enter' \|\| e\.key === ' '\)/g) || [];
    // challenges card (pre-existing) + nutrition + protein = at least 3
    expect(keyHandlers.length).toBeGreaterThanOrEqual(3);
    // LIVE-P1-03: these aria labels moved into i18n (HomePage renders
    // them via t('home.viewNutritionDetails') / t('home.viewProteinDetails'));
    // the rendered English strings are unchanged.
    expect(src).toContain('home.viewNutritionDetails');
    expect(src).toContain('home.viewProteinDetails');
    const enDict = read('src/lib/i18n/en.ts');
    expect(enDict).toContain("'home.viewNutritionDetails': 'View Nutrition Details'");
    expect(enDict).toContain("'home.viewProteinDetails': 'View Protein Details'");
  });
});

describe('QA4-030 micro-type floors', () => {
  it('ScanMealModal carries no 9px text and its macro labels are 11px', () => {
    const src = read('src/components/ScanMealModal.tsx');
    expect(src).not.toContain('text-[9px]');
    // Gauntlet UX-15 converted px arbitrary values to rem
    // (0.6875rem === 11px at the default root) so Large/XLarge text
    // settings scale micro-type too. Same floor, relative unit.
    expect(src).toContain('text-[0.6875rem] font-mono uppercase text-text-muted block">Calories</label>');
  });

  it('ErrorState diagnostics render full-opacity at 11px (no /60 muted)', () => {
    const src = read('src/components/ErrorState.tsx');
    expect(src).not.toContain('text-text-muted/60');
    expect(src).toContain('text-[0.6875rem] font-mono text-text-secondary break-words');
    expect(src).toContain('text-[0.6875rem] font-mono text-text-secondary pt-0.5');
  });
});

describe('QA4-031 jargon glosses in plain language', () => {
  it('plan % hint no longer defines the feature using 1RM/RPE/back-off (en + hi)', () => {
    const enSrc = read('src/lib/i18n/en.ts');
    const hiSrc = read('src/lib/i18n/hi.ts');
    const enHint = enSrc.match(/'plan\.intensityPercentHint': '([^']+)'/)?.[1] ?? '';
    const hiHint = hiSrc.match(/'plan\.intensityPercentHint': '([^']+)'/)?.[1] ?? '';
    expect(enHint).toContain('heaviest weight you could lift just once');
    expect(enHint).not.toMatch(/1RM|RPE|back-off/);
    expect(hiHint.length).toBeGreaterThan(20);
    expect(hiHint).not.toMatch(/1RM|RPE|बैक-ऑफ़/);
  });

  it('Progress 1RM labels carry a plain-English gloss', () => {
    const progress = read('src/components/ProgressPage.tsx');
    expect(progress).toContain('Current 1RM (your estimated best single lift)');
    expect(progress).toContain('Estimated 1RM (best single lift, worked out from your sets)');
    const prs = read('src/components/PRsPage.tsx');
    expect(prs).toContain('Estimated 1RM (best single lift)');
  });

  it('GoalSelectorModal explains impact without DOTS/tonnage/velocity jargon', () => {
    const src = read('src/components/GoalSelectorModal.tsx');
    // Anchors updated at the #31 merge: the section heading and the
    // recalculate option are i18n-wired now, so slice on their keys.
    const summary = src.slice(src.indexOf("t('goals.howTitle')"), src.indexOf("t('goals.recalcTitle')"));
    expect(summary).not.toMatch(/DOTS|Tonnage|Weight Velocity|Prescription Engine/);
    expect(summary).toContain('how many reps you aim for');
    expect(summary).toContain('how much protein to aim for');
  });
});

describe('QA4-035(a) password floor', () => {
  it('CreateAccountScreen requires 8 characters with matching copy', () => {
    const src = read('src/components/onboarding/CreateAccountScreen.tsx');
    expect(src).toContain('password.length < 8');
    expect(src).not.toContain('password.length < 6');
    expect(src).toContain('Password must be at least 8 characters long.');
    expect(src).toContain('placeholder="At least 8 characters"');
    expect(src).not.toContain('At least 6 characters');
  });
});

describe('QA4A-008 ReportAIModal copy tells the truth', () => {
  it('default success copy says flagged for review, not suppressed', () => {
    const src = read('src/components/ReportAIModal.tsx');
    expect(src).toContain('flagged for review');
    expect(src).toContain('suppressesOutput = false');
    // The stronger wording exists only behind the opt-in prop
    expect(src).toContain('suppressesOutput\n                ? \'This AI response has been flagged and suppressed.');
    expect(src).toContain('suppressesOutput?: boolean');
  });

  it('stores the report locally (the behaviour the default copy describes)', () => {
    const src = read('src/components/ReportAIModal.tsx');
    expect(src).toContain("localStorage.getItem('ascend_ai_reports')");
    expect(src).toContain('onReported');
  });
});

describe('QA4-035(b) CSP hardening', () => {
  it("script-src allows no 'unsafe-eval'; 'unsafe-inline' stays per the SEC-16 verdict", () => {
    const cfg = read('next.config.js');
    const scriptSrc = cfg.match(/"script-src[^"]*"/)?.[0] ?? '';
    expect(scriptSrc).not.toContain('unsafe-eval');
    // Gauntlet SEC-16 (2026-10-29): a middleware nonce CSP was
    // built and live-tested, then reverted — the pages are
    // statically generated, so prerendered inline scripts never
    // receive a per-request nonce and hydration would break.
    // 'unsafe-inline' therefore stays until an explicit
    // force-dynamic-rendering decision; violation reporting
    // (SEC-17 short-term) is wired in its place.
    expect(scriptSrc).toContain('unsafe-inline');
    expect(cfg).toContain('report-uri /api/csp-report');
  });
});
