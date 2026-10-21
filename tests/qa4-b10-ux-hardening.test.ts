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
  it('shared Button sm is 40px tall (was 36px)', () => {
    const src = read('src/components/ui/Button.tsx');
    expect(src).toContain("sm: 'text-xs px-3 py-1.5 min-h-[40px] gap-1.5'");
    expect(src).not.toContain('min-h-[36px]');
  });

  it('globals define the tap-40 hit-area utility at exactly 40px', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('.tap-40::before');
    expect(css).toContain('width: 40px');
    expect(css).toContain('height: 40px');
  });

  it('VoiceWorkoutLoggerModal steppers are 40px (were 24px)', () => {
    const src = read('src/components/VoiceWorkoutLoggerModal.tsx');
    expect(src).not.toContain('w-6 h-6 rounded bg-bg-secondary');
    expect(src).toContain('w-10 h-10 min-w-[40px] min-h-[40px]');
    // RPE pills reach 40px tall too
    expect(src).toContain('py-2 min-h-[40px] rounded text-3xs font-mono font-bold');
  });

  it('SuggestedWorkoutModal steppers carry the tap-40 hit area (were 28px)', () => {
    const src = read('src/components/SuggestedWorkoutModal.tsx');
    expect(src).not.toContain('className="w-7 h-7 flex items-center justify-center rounded text-text-muted');
    expect(src).toContain('w-7 h-7 tap-40 flex items-center justify-center');
  });

  it('ActiveWorkoutScreen header buttons are 40px (were 32px)', () => {
    const src = read('src/components/ActiveWorkoutScreen.tsx');
    expect(src).not.toContain('className="w-8 h-8 rounded-lg bg-bg-secondary hover:bg-bg-tertiary');
    expect(src).toContain('w-10 h-10 min-w-[40px] min-h-[40px] rounded-lg bg-bg-secondary hover:bg-bg-tertiary');
    // Skip-set chip in the RPE row: 36 -> 40
    expect(src).not.toContain('py-2 min-h-[36px] rounded-lg text-3xs');
    expect(src).toContain('py-2 min-h-[40px] rounded-lg text-3xs');
    // Discard button: 36 -> 40
    expect(src).not.toContain('min-h-[36px] min-w-[36px]');
  });

  it('modal X closes use a 40px minimum hit area across the modal set', () => {
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
      expect(read(f), f).toContain('min-h-[40px] min-w-[40px]');
    }
  });
});
