/**
 * Task 1.5 (2026-11-05): dead controls removed / wired.
 *
 * Every verdict below was established by whole-repo grep BEFORE any
 * deletion; the raw outputs live in ~/workspace/phase1-grep-evidence.md.
 *
 *  (a) Fuel "Past Meal History" row flipped a state flag nothing
 *      rendered → it now navigates to the Meals sub-tab (the actual
 *      meal-history view); the flag + its back-handler are gone.
 *  (b) Today mounted a SuggestedWorkoutModal that could never open
 *      (no true-setter) → mount/wiring removed from HomePage; the
 *      generator stays reachable from Train (two real openers).
 *  (c) Train's Change Workout sheet could never open → removed.
 *  (d) Plate calculator's unit handler had no caller and no toggle
 *      UI → removed; an on-screen note states the profile unit.
 *  (e) Train's repeat-workout handler and page-level voice logger
 *      had no callers → removed (the working VoiceWorkoutLoggerModal
 *      is a different feature and stays).
 *  (f) Goal Selector in Train: NO trigger existed. The modal stays
 *      reachable via You → Fitness Goals (ProfileView has a real
 *      opener); Train's orphan mount/state/import were removed.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('(a) Past Meal History is wired to the Meals sub-tab', () => {
  const src = read('src/components/MealsPage.tsx');

  it('the row navigates to the meals sub-tab', () => {
    const row = src.slice(src.indexOf("t('meals.toolsPastHistory')") - 1400, src.indexOf("t('meals.toolsPastHistory')"));
    expect(row).toContain("setFuelSubTab('meals')");
  });

  it('the dead flag and its back-handler effect are gone', () => {
    expect(src).not.toContain('isMealHistoryOpen');
    expect(src).not.toContain('setIsMealHistoryOpen');
  });

  it('the Meals sub-tab is the history view (still present)', () => {
    expect(src).toContain("fuelSubTab === 'meals'");
    expect(src).toContain("t('meals.historyTitle')");
  });
});

describe('(b) Today no longer mounts the unopenable SuggestedWorkoutModal', () => {
  const home = read('src/components/HomePage.tsx');
  const train = read('src/components/WorkoutPage.tsx');

  it('HomePage has no suggested-workout wiring left', () => {
    expect(home).not.toContain('<SuggestedWorkoutModal');
    expect(home).not.toContain("import('@/components/SuggestedWorkoutModal')");
    expect(home).not.toContain('isSuggestedModalOpen');
    expect(home).not.toContain('handleStartSuggestedWorkout');
  });

  it('the generator stays reachable from Train (two openers + mount)', () => {
    expect(train).toContain("import SuggestedWorkoutModal from '@/components/SuggestedWorkoutModal'");
    expect((train.match(/setIsSuggestedModalOpen\(true\)/g) ?? []).length).toBe(2);
    expect(train).toContain('<SuggestedWorkoutModal');
    expect(fs.existsSync(path.join(process.cwd(), 'src/components/SuggestedWorkoutModal.tsx'))).toBe(true);
  });
});

describe("(c) Train's never-opened Change Workout sheet is removed", () => {
  const train = read('src/components/WorkoutPage.tsx');

  it('no change-workout state, sheet, or wiring remains in Train', () => {
    expect(train).not.toContain('isChangeWorkoutOpen');
    expect(train).not.toContain('changeWorkoutRef');
    expect(train).not.toContain('Change Workout Bottom Sheet');
  });

  it("Today's separate change-workout sheet is untouched", () => {
    const home = read('src/components/HomePage.tsx');
    expect(home).toContain('isChangeWorkoutOpen');
  });
});

describe('(d) plate calculator: unwired unit handler removed, profile unit disclosed', () => {
  const src = read('src/components/PlateCalculatorModal.tsx');

  it('handleUnitChange is gone', () => {
    expect(src).not.toContain('const handleUnitChange');
    expect(src).not.toContain('onClick={() => handleUnitChange');
  });

  it('the on-screen note names the profile unit (both dictionaries)', () => {
    expect(src).toContain("t('plates.profileUnitNote', { unit: unit.toUpperCase() })");
    expect(en['plates.profileUnitNote']).toContain('{unit}');
    expect(hi['plates.profileUnitNote']).toContain('{unit}');
  });

  it('both mounts still pass the profile unit', () => {
    expect(read('src/components/WorkoutPage.tsx')).toContain('initialUnit={userUnit}');
    expect(read('src/components/PRsPage.tsx')).toContain('initialUnit={userUnit}');
  });
});

describe('(e) Train dead handlers removed; the real voice logger stays', () => {
  const train = read('src/components/WorkoutPage.tsx');

  it('repeat handler and page voice logger are gone', () => {
    expect(train).not.toContain('handleRepeatLastWorkout');
    expect(train).not.toContain('toggleVoiceLogging');
    expect(train).not.toContain('pageVoice');
    expect(train).not.toContain('isListening');
  });

  it('VoiceWorkoutLoggerModal (the working feature) is untouched', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'src/components/VoiceWorkoutLoggerModal.tsx'))).toBe(true);
    expect(read('src/lib/voice-logger.ts')).toContain('createSpeechRecognizer');
  });
});

describe('(f) Goal Selector: no Train trigger existed; You → Fitness Goals is the entry', () => {
  it('Train orphan mount/state/import removed', () => {
    const train = read('src/components/WorkoutPage.tsx');
    expect(train).not.toContain("import GoalSelectorModal");
    expect(train).not.toContain('<GoalSelectorModal');
    expect(train).not.toContain('isGoalSelectorOpen');
  });

  it('ProfileView keeps the modal AND a real opener (Fitness Goals row)', () => {
    const profile = read('src/components/ProfileView.tsx');
    expect(profile).toContain('<GoalSelectorModal');
    expect(profile).toContain('setIsGoalSelectorOpen(true)');
  });
});

describe('orphaned i18n keys deleted (en + hi)', () => {
  const ORPHANS = [
    'toast.lastSessionLoadedOne', 'toast.lastSessionLoadedMany', 'toast.titleWorkoutLoaded',
    'toast.planSaved', 'toast.voiceLogged', 'toast.voiceParseFailed', 'toast.titleVoiceAdded',
    'toast.titleVoiceError', 'toast.titleVoiceLogging', 'toast.voiceUnsupportedBrowser',
    'toast.voiceMicNative', 'toast.voiceMicBrowser', 'toast.voiceUnavailableDevice',
    'toast.voiceListening', 'train.startEmptyWorkout',
  ];

  it('all 15 are absent from both dictionaries', () => {
    for (const key of ORPHANS) {
      expect((en as Record<string, string>)[key], `en ${key}`).toBeUndefined();
      expect((hi as Record<string, string>)[key], `hi ${key}`).toBeUndefined();
    }
  });

  it('look-alike live keys were NOT deleted', () => {
    expect(en['toast.titlePlanSaved']).toBeTruthy();
    expect(en['meals.toolsPastHistory']).toBeTruthy();
    expect(hi['toast.titlePlanSaved']).toBeTruthy();
  });
});
