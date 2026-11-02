/**
 * Open-items J5.1 (P3): the workout view (Beginner/Advanced) was
 * slaved to Today density via a null "Auto" override — flipping
 * density flipped the workout view, which read as the app changing
 * the user's setup behind their back. The view is now its own
 * persisted preference:
 *  - sanitize materializes a legacy null/invalid override ONCE to
 *    the mode the density rule resolves at that moment (upgrade
 *    changes nobody's current view);
 *  - an explicit choice is stored and survives later density flips;
 *  - neither picker offers Auto anymore.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sanitizeUiPreferences } from '../src/lib/store';
import { resolveWorkoutMode } from '../src/lib/workout-mode';

describe('open-items J5.1: workout view decoupled from density', () => {
  it('legacy Auto (null) materializes to the current density-resolved mode', () => {
    expect(
      (sanitizeUiPreferences({ density: 'simple', workoutModeOverride: null }, false) as any).workoutModeOverride,
    ).toBe('beginner');
    expect(
      (sanitizeUiPreferences({ density: 'detailed', workoutModeOverride: null }, true) as any).workoutModeOverride,
    ).toBe('advanced');
    // Missing entirely behaves the same.
    expect(
      (sanitizeUiPreferences({ density: 'detailed' }, true) as any).workoutModeOverride,
    ).toBe('advanced');
  });

  it('an explicit choice survives a later density flip untouched', () => {
    const pinned = sanitizeUiPreferences(
      { density: 'simple', workoutModeOverride: 'advanced' },
      false,
    ) as any;
    expect(pinned.workoutModeOverride).toBe('advanced');
    // The user then flips density — sanitize never rewrites a
    // concrete override, so the workout view stays Advanced.
    const afterFlip = sanitizeUiPreferences(
      { density: 'detailed', workoutModeOverride: pinned.workoutModeOverride },
      false,
    ) as any;
    expect(afterFlip.workoutModeOverride).toBe('advanced');
    expect(resolveWorkoutMode(afterFlip.density, afterFlip.workoutModeOverride)).toBe('advanced');
  });

  it('neither picker offers Auto anymore', () => {
    const settings = fs.readFileSync(path.join(process.cwd(), 'src/components/SettingsView.tsx'), 'utf8');
    const train = fs.readFileSync(path.join(process.cwd(), 'src/components/WorkoutPage.tsx'), 'utf8');
    expect(settings).not.toContain("'auto' ? null");
    expect(train).not.toContain("value={workoutModeOverride ?? 'auto'}");
    expect(train).not.toContain("v === 'auto' ? null : v");
    expect(train).toContain('setUiPreferences({ workoutModeOverride: v })');
  });
});
