import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateBodyMetricsForm } from '@/components/BodyMetricsModal';

/**
 * QA-hardening R9: the shared disabled RULE — Send/Log controls are
 * disabled while their input is empty or invalid. Audit phase 4
 * unified the disabled STYLE (globals.css .btn-primary:disabled +
 * the disabled: utility tokens — pinned below); this item is the
 * behavior. Audit of every compose/log control found two violations
 * (BodyMetricsModal Save and LogPastWorkoutModal Save were enabled
 * with nothing valid to save); both are fixed to derive their
 * disabled state from the same validity test their submit handler
 * runs. The rest already complied and are pinned here.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const globals = read('src/app/globals.css');
const coachSection = read('src/components/CoachChatSection.tsx');
const coachTab = read('src/components/CoachChatTab.tsx');
const meals = read('src/components/MealsPage.tsx');
const scan = read('src/components/ScanMealModal.tsx');
const feedback = read('src/components/FeedbackModal.tsx');
const bodyMetrics = read('src/components/BodyMetricsModal.tsx');
const logPast = read('src/components/LogPastWorkoutModal.tsx');

describe('R9: the shared disabled style path (Phase 4 tokens)', () => {
  it('globals.css carries the single disabled rule for .btn-primary', () => {
    expect(globals).toContain('.btn-primary:disabled');
  });
});

describe('R9: controls that already followed the rule (pinned)', () => {
  it('Ask-the-Coach Send (CoachChatSection)', () => {
    expect(coachSection).toContain('disabled={sending || input.trim().length === 0}');
  });
  it('check-in note Send (CoachChatTab)', () => {
    expect(coachTab).toContain('disabled={!noteDraft.trim()}');
  });
  it('Fuel quick-log Log (MealsPage)', () => {
    expect(meals).toContain('disabled={!naturalQuery.trim() || isNaturalParsing}');
  });
  it('Fuel Save Meal (MealsPage builder)', () => {
    expect(meals).toContain('disabled={nameMissing || foods.length === 0 || !hasNamedFood || !!zeroFood}');
  });
  it('Scan-meal add item + refine (ScanMealModal)', () => {
    expect(scan).toContain('disabled={!newItemName.trim()}');
    expect(scan).toContain('disabled={!refinementInput.trim() || isRefining}');
  });
  it('Feedback Send (FeedbackModal)', () => {
    expect(feedback).toContain('disabled={isSubmitting || !message.trim()}');
  });
});

describe('R9: fixed controls derive disabled from their own validator', () => {
  it('BodyMetricsModal Save is disabled unless the live form validates', () => {
    expect(bodyMetrics).toContain('const canSaveMetrics =');
    expect(bodyMetrics).toContain('disabled={!canSaveMetrics}');
  });

  it('the predicate itself: blank weight is invalid, a real weight is valid', () => {
    const base = { height: '', bodyFat: '', chest: '', waist: '', hips: '', unit: 'kg' as const, date: '2026-11-07' };
    expect(validateBodyMetricsForm({ ...base, weight: '' }).values).toBeUndefined();
    expect(validateBodyMetricsForm({ ...base, weight: '999' }).values).toBeUndefined();
    expect(validateBodyMetricsForm({ ...base, weight: '80' }).values).toBeDefined();
  });

  it('LogPastWorkoutModal Save is disabled until a set is loggable', () => {
    expect(logPast).toContain('const hasLoggableSet = exercises.some(');
    expect(logPast).toContain('disabled={!hasLoggableSet}');
  });
});
