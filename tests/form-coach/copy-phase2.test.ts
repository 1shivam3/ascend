import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { translate } from '../../src/lib/i18n';
import { en } from '../../src/lib/i18n/en';
import { hi } from '../../src/lib/i18n/hi';
import type { StringKey } from '../../src/lib/i18n/en';

/**
 * Audit phase 2, Task 2.3 (P2-5) — Form Coach copy.
 *
 * - Upload prompt is pointer-aware: "Choose a video" on touch
 *   (coarse pointer), drag-and-drop wording only for fine pointers.
 * - The privacy line drops the tech jargon: "Your video is analyzed
 *   on your phone and never uploaded." — no "WebAssembly" in the UI.
 * - The three stacked colored callouts (privacy / filming / safety)
 *   are one neutral card with the same content.
 * - Entry layout: Today, Train tools and the in-workout entry all
 *   render the SAME FormCoachModal component, so the select →
 *   analyzing → report layout is identical from every entry.
 * - The "Squat Form Check" → "Form Check" rename shipped in PR #113;
 *   these assertions verify it stays done (not re-implemented here).
 */

const root = process.cwd();
const readSrc = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const modalSrc = readSrc('src/features/form-coach/components/FormCoachModal.tsx');

function walkSrc(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSrc(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('P2-5 upload copy — pointer-aware', () => {
  it('the modal branches on (pointer: coarse) for the upload prompt', () => {
    expect(modalSrc).toContain("window.matchMedia('(pointer: coarse)')");
    expect(modalSrc).toContain('isCoarsePointer');
    expect(modalSrc).toContain("t('formCoach.chooseVideo')");
    expect(modalSrc).toContain("t('formCoach.dragDropPrefix')");
    expect(modalSrc).toContain("t('formCoach.browseFiles')");
  });

  it('copy keys resolve in English and Hindi', () => {
    expect(translate('en', 'formCoach.chooseVideo')).toBe('Choose a video');
    for (const key of [
      'formCoach.chooseVideo',
      'formCoach.dragDropPrefix',
      'formCoach.browseFiles',
    ] as StringKey[]) {
      expect(hi[key]).toBeDefined();
    }
  });
});

describe('P2-5 privacy line — no tech jargon', () => {
  it('the privacy copy is exactly the plain-language sentence, en+hi', () => {
    expect(en['formCoach.privacyLine']).toBe(
      'Your video is analyzed on your phone and never uploaded.'
    );
    expect(hi['formCoach.privacyLine']).toBeDefined();
  });

  it('no user-facing WebAssembly wording remains in the modal UI', () => {
    // Strip block comments (file header, P2-5 note) — what remains
    // is code and rendered copy, and none of it may name the tech.
    const codeOnly = modalSrc.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly).not.toContain('WebAssembly');
    expect(codeOnly).not.toContain('never uploaded to any cloud server');
  });
});

describe('P2-5 one neutral card for privacy / filming / safety', () => {
  it('the three lines render in one surface-elevated card via i18n', () => {
    expect(modalSrc).toContain("t('formCoach.privacyLead')");
    expect(modalSrc).toContain("t('formCoach.filmingLead')");
    expect(modalSrc).toContain("t('formCoach.filmingLine')");
    expect(modalSrc).toContain("t('formCoach.safetyLead')");
    expect(modalSrc).toContain("t('formCoach.safetyLine')");
    // The old per-callout color blocks are gone from the select state.
    expect(modalSrc).not.toContain('bg-emerald-500/10 border border-emerald-500/20');
    expect(modalSrc).not.toContain('bg-amber-500/10 border border-amber-500/20 flex items-start');
    for (const key of [
      'formCoach.privacyLead',
      'formCoach.filmingLead',
      'formCoach.filmingLine',
      'formCoach.safetyLead',
      'formCoach.safetyLine',
    ] as StringKey[]) {
      expect(hi[key]).toBeDefined();
    }
  });

  it('the safety content is preserved verbatim (not the limitation copy)', () => {
    expect(en['formCoach.safetyLine']).toContain('not medical advice');
    expect(en['formCoach.filmingLine']).toContain('side-profile angle at hip height');
  });
});

describe('P2-5 entry layout — one shared modal from every entry point', () => {
  it('Today, Train and the in-workout screen all render FormCoachModal', () => {
    expect(readSrc('src/components/HomePage.tsx')).toContain('<FormCoachModal');
    expect(readSrc('src/components/WorkoutPage.tsx')).toContain('<FormCoachModal');
    expect(readSrc('src/components/ActiveWorkoutScreen.tsx')).toContain('<FormCoachModal');
  });
});

describe('P2-5 Form Check rename — already shipped in PR #113, verified', () => {
  it('the quick action uses home.formCheck = "Form Check"', () => {
    expect(en['home.formCheck']).toBe('Form Check');
    expect(readSrc('src/components/HomePage.tsx')).toContain("t('home.formCheck')");
  });

  it('no source file still says "Squat Form Check"', () => {
    for (const file of walkSrc(path.join(root, 'src'))) {
      expect(fs.readFileSync(file, 'utf8')).not.toContain('Squat Form Check');
    }
  });
});
