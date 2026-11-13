import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { translate } from '../../src/lib/i18n';
import { en } from '../../src/lib/i18n/en';
import { hi } from '../../src/lib/i18n/hi';
import type { StringKey } from '../../src/lib/i18n/en';

/**
 * Audit phase 2, Task 2.2 (P1-1) — no leaked engine strings.
 *
 * The audit recording showed the live overlay badge rendering the
 * raw MovementPhase enum ("Tracking_lost") while the Tracking tile
 * claimed "Active". These tests pin the fixes: every phase renders
 * through the PHASE_LABEL_KEYS UI-string map (en+hi), the tile
 * derives from the same currentPhase state, the angle tile is
 * "Joint angle" until detection, counts pluralize, the depth enum
 * renders through a map, and the re-run link cluster is one
 * "Wrong exercise? Change" button opening a ≥44px-row picker.
 */

const root = process.cwd();
const readSrc = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const modalSrc = readSrc('src/features/form-coach/components/FormCoachModal.tsx');
const summarySrc = readSrc('src/features/form-coach/components/FormSessionSummaryModal.tsx');

const PHASE_KEYS: Record<string, StringKey> = {
  standing: 'formCoach.phaseStanding',
  descending: 'formCoach.phaseDescending',
  bottom: 'formCoach.phaseBottom',
  ascending: 'formCoach.phaseAscending',
  lockout: 'formCoach.phaseLockout',
  tracking_lost: 'formCoach.phaseTrackingLost',
};

describe('P1-1 phase strings — every MovementPhase has an en+hi UI label', () => {
  it('the modal maps every phase through PHASE_LABEL_KEYS and never renders the raw enum', () => {
    expect(modalSrc).toContain('PHASE_LABEL_KEYS[currentPhase]');
    expect(modalSrc).not.toContain('{currentPhase}');
    for (const key of Object.values(PHASE_KEYS)) {
      expect(modalSrc).toContain(`'${key}'`);
    }
  });

  it('each phase key resolves to real copy in English and Hindi — never the raw enum', () => {
    for (const [phase, key] of Object.entries(PHASE_KEYS)) {
      const enText = translate('en', key);
      expect(enText).not.toBe(key);
      expect(enText).not.toContain('_');
      expect(hi[key]).toBeDefined();
      expect(hi[key]).not.toContain('_');
    }
    // The audit's exact leak:
    expect(translate('en', 'formCoach.phaseTrackingLost')).toBe('Tracking lost');
  });

  it('the Tracking tile derives from the same currentPhase state as the badge', () => {
    expect(modalSrc).toContain("const hudTrackingLost = currentPhase === 'tracking_lost';");
    expect(modalSrc).toContain('hudTrackingLost ?');
    expect(modalSrc).toContain("t('formCoach.trackingActive')");
    // No hard-coded "Active" tile remains.
    expect(modalSrc).not.toContain('>Active</span>');
  });
});

describe('P1-1 angle tile — Joint angle until detection, exercise metric after', () => {
  it('the label logic gates on detection and picks hip for hinge, knee for squat pattern', () => {
    expect(modalSrc).toContain("t('formCoach.jointAngle')");
    expect(modalSrc).toContain("t('formCoach.minKneeAngle')");
    expect(modalSrc).toContain("t('formCoach.minHipAngle')");
    expect(modalSrc).toContain('hudExerciseKnown');
    // The old unconditional knee label is gone.
    expect(modalSrc).not.toContain("'Min Knee Angle'");
  });

  it('angle + tracking keys exist in both dictionaries', () => {
    for (const key of [
      'formCoach.jointAngle',
      'formCoach.minKneeAngle',
      'formCoach.minHipAngle',
      'formCoach.tracking',
      'formCoach.trackingActive',
    ] as StringKey[]) {
      expect(en[key]).toBeDefined();
      expect(hi[key]).toBeDefined();
    }
  });
});

describe('P1-1 pluralization — 1 rep / 2 reps, 1 pull / 2 pulls', () => {
  it('plural keys resolve with counts in English and Hindi', () => {
    expect(translate('en', 'formCoach.repOne', { count: 1 })).toBe('1 rep');
    expect(translate('en', 'formCoach.repOther', { count: 2 })).toBe('2 reps');
    expect(translate('en', 'formCoach.pullOne', { count: 1 })).toBe('1 pull');
    expect(translate('en', 'formCoach.pullOther', { count: 7 })).toBe('7 pulls');
    for (const key of [
      'formCoach.repOne',
      'formCoach.repOther',
      'formCoach.pullOne',
      'formCoach.pullOther',
    ] as StringKey[]) {
      expect(hi[key]).toBeDefined();
    }
  });

  it('the overlay badge and the report use the plural keys', () => {
    expect(modalSrc).toContain("'formCoach.pullOne' : 'formCoach.pullOther'");
    expect(summarySrc).toContain("'formCoach.repOne' : 'formCoach.repOther'");
    expect(summarySrc).not.toContain('{summary.reps.length} reps');
  });
});

describe('P1-1 depth classification renders through a UI-string map', () => {
  it('the summary maps the enum and never munges the raw value', () => {
    expect(summarySrc).toContain('DEPTH_LABEL_KEYS[rep.estimatedDepth]');
    expect(summarySrc).not.toContain("replace('_', ' ')");
    for (const key of [
      'formCoach.depthBelowParallel',
      'formCoach.depthParallel',
      'formCoach.depthAboveParallel',
      'formCoach.depthUnknown',
    ] as StringKey[]) {
      expect(en[key]).toBeDefined();
      expect(hi[key]).toBeDefined();
      expect(translate('en', key)).not.toContain('_');
    }
  });
});

describe('P1-1 re-run correction — one button, ≥44px picker rows', () => {
  it('the link cluster is replaced by the Wrong exercise button + picker', () => {
    expect(summarySrc).toContain("t('formCoach.wrongExercise')");
    expect(summarySrc).toContain("t('formCoach.rerunPickerTitle')");
    expect(summarySrc).toContain('min-h-[44px]');
    expect(summarySrc).not.toContain('underline underline-offset-2');
    expect(en['formCoach.wrongExercise']).toBe('Wrong exercise? Change');
    expect(hi['formCoach.wrongExercise']).toBeDefined();
  });

  it('picker rows carry plain exercise names, not "Re-run as …" link text', () => {
    expect(modalSrc).toContain('label: EXERCISE_NAMES[id]');
  });
});

describe('P1-1 video preview — sized to the video aspect, not a wide black box', () => {
  it('the analyzing container uses the video aspect ratio with a height cap', () => {
    expect(modalSrc).toContain('aspectRatio: videoAspect ?? 16 / 9');
    expect(modalSrc).toContain('calc(58vh * ${videoAspect})');
    expect(modalSrc).not.toContain('aspect-video bg-black');
  });
});
