/**
 * Open-items UX F-03 (P2): Train → Coach stacked TWO chat surfaces in
 * one scroll (guided check-in + free-form coach chat). The Coach tab
 * is now segmented — Check-in / Ask the coach — one visible at a
 * time, both features fully preserved (block management still opens
 * from the check-in; the chat still reads its persisted store, so
 * segment switches cannot lose history).
 *
 * Default segment: Check-in while today's check-in is unanswered.
 * The data model has no separate completion flag — answers persist
 * immediately as today's ManualCheckin — so "due" = no record for
 * today. That rule lives in resolveDefaultCoachSegment and is
 * behaviour-tested here.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveDefaultCoachSegment } from '../src/lib/coach-session';
import type { ManualCheckin } from '../src/lib/coach-engine';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const TODAY = '2026-11-01';
const checkin = { readiness: 4 } as ManualCheckin;

describe('open-items UX F-03: coach segment default', () => {
  it('no record for today (or no check-ins at all) → check-in segment', () => {
    expect(resolveDefaultCoachSegment({}, TODAY)).toBe('checkin');
    expect(resolveDefaultCoachSegment(null, TODAY)).toBe('checkin');
    expect(resolveDefaultCoachSegment(undefined, TODAY)).toBe('checkin');
    expect(resolveDefaultCoachSegment({ '2026-10-31': checkin }, TODAY)).toBe('checkin');
  });

  it("today's check-in answered → ask segment", () => {
    expect(resolveDefaultCoachSegment({ [TODAY]: checkin }, TODAY)).toBe('ask');
  });

  it('segment labels exist in both dictionaries (parity)', () => {
    for (const key of ['coach.segmentCheckin', 'coach.segmentAsk', 'coach.segmentAria'] as const) {
      expect(en[key], `en ${key}`).toBeTruthy();
      expect(hi[key], `hi ${key}`).toBeTruthy();
    }
  });

  it('WorkoutPage renders the segments mutually exclusively', () => {
    const page = fs.readFileSync(path.join(process.cwd(), 'src/components/WorkoutPage.tsx'), 'utf8');
    expect(page).toContain("t('coach.segmentCheckin')");
    expect(page).toContain("t('coach.segmentAsk')");
    expect(page).toContain("coachSegment === 'checkin' ? (");
    expect(page).toContain('<CoachChatTab');
    expect(page).toContain('<CoachChatSection />');
    // Default re-resolved on entering the Coach tab.
    expect(page).toContain('resolveDefaultCoachSegment(useStore.getState().dailyCheckins, getLocalTodayStr())');
  });
});
