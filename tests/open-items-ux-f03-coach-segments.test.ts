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
 *
 * FOLLOW-UP (2026-11-01, preview spot-check regression): the first
 * F-03 shape switched segments with a ternary, UNMOUNTING the
 * inactive panel. Chip answers survived (they persist immediately),
 * but the check-in's in-progress state — the unsent note draft and
 * the current question step, both CoachChatTab useState — was lost
 * on every switch. Fix: both panels stay mounted; the inactive one
 * is hidden (display:none + aria-hidden). The pins below lock that
 * shape, and lock that CoachChatSection can never auto-send from a
 * hidden mount (it sends only from user gestures: Enter, the Send
 * button, and — since Slice B — the empty-state suggestion chips).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveDefaultCoachSegment } from '../src/lib/coach-session';
import type { ManualCheckin } from '../src/lib/coach-engine';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const TODAY = '2026-11-01';
const checkin: ManualCheckin = { sleep: 4, soreness: 4 };

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

  it('WorkoutPage renders one segment at a time, both panels kept mounted', () => {
    const page = fs.readFileSync(path.join(process.cwd(), 'src/components/WorkoutPage.tsx'), 'utf8');
    expect(page).toContain("t('coach.segmentCheckin')");
    expect(page).toContain("t('coach.segmentAsk')");
    expect(page).toContain('<CoachChatTab');
    expect(page).toContain('<CoachChatSection />');
    // Default re-resolved on entering the Coach tab.
    expect(page).toContain('resolveDefaultCoachSegment(useStore.getState().dailyCheckins, getLocalTodayStr())');
    // Keep-mounted: visibility toggles by segment, never a ternary
    // that unmounts the inactive panel.
    expect(page).not.toContain("coachSegment === 'checkin' ? (");
    expect(page).toContain("coachSegment === 'checkin' ? undefined : 'hidden'");
    expect(page).toContain("coachSegment === 'ask' ? undefined : 'hidden'");
    expect(page).toContain("aria-hidden={coachSegment !== 'checkin'}");
    expect(page).toContain("aria-hidden={coachSegment !== 'ask'}");
  });
});

describe('open-items UX F-03 follow-up: segment switch loses nothing in progress', () => {
  const readSrc = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  it('the in-progress state at risk lives in CoachChatTab local state (root cause)', () => {
    const tab = readSrc('src/components/CoachChatTab.tsx');
    // The answered-question set and the unsent per-question note
    // draft are component-local — they survive ONLY if the
    // component is never unmounted by a segment switch.
    // (§24, Phase 3.6: the bare `stepIndex` this pin used to name
    // was replaced by the id-keyed answered-steps state — the
    // at-risk local state is now that set.)
    expect(tab).toContain('const [answeredSteps, setAnsweredSteps] = useState<CheckinStep[]>');
    expect(tab).toContain("const [noteDraft, setNoteDraft] = useState('')");
  });

  it('WorkoutPage never conditionally unmounts either coach panel', () => {
    const page = readSrc('src/components/WorkoutPage.tsx');
    // Both panels render unconditionally inside visibility wrappers;
    // the only coachSegment ternary left is the className toggle.
    expect(page).not.toMatch(/coachSegment === 'checkin' \? \(\s*<CoachChatTab/);
    expect(page).not.toMatch(/: \(\s*<CoachChatSection/);
    const classToggles = page.match(/coachSegment === '(checkin|ask)' \? undefined : 'hidden'/g) ?? [];
    expect(classToggles).toHaveLength(2);
  });

  it('the hidden chat panel cannot auto-send: send fires only from user gestures', () => {
    const section = readSrc('src/components/CoachChatSection.tsx');
    // The original pin banned useEffect outright ("nothing runs on
    // mount"). Slice B (2026-11-05) legitimately added two mount
    // effects — settling persisted action cards (a local store
    // write) and stick-to-bottom scrolling (DOM only). The invariant
    // that matters is unchanged and now pinned directly: no effect
    // in this section sends a message or issues a request, so a
    // hidden mount still costs zero coach-chat calls.
    const effectBodies = section.match(/useEffect\(\(\) => \{[\s\S]*?\n  \}, \[/g) ?? [];
    expect(effectBodies.length).toBeGreaterThan(0);
    for (const body of effectBodies) {
      expect(body).not.toContain('send(');
      expect(body).not.toContain('fetch(');
    }
    // send() fires from exactly three user-gesture sites: the input
    // Enter handler, the Send button, and the empty-state chips.
    expect(section.match(/void send\(/g)).toHaveLength(3);
    expect(section).toContain("if (e.key === 'Enter') void send();");
    expect(section).toContain('onClick={() => void send()}');
    expect(section).toContain('onClick={() => void send(t(key))}');
  });
});
