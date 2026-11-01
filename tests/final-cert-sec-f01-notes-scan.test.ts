/**
 * Final-cert SEC F-01 (P2): the coach-chat safety scan's notes
 * extraction split contextText on '\n\n' and scanned only the chunk
 * STARTING with the notes header. A disclosure after a blank line
 * inside the notes, or a header not at a chunk start, escaped the scan
 * while still reaching the provider verbatim. The extraction now spans
 * header → next known section header, regardless of blank lines.
 * The SEC2-2 property must hold: generated scaffolding (the PAIN
 * EPISODES section, pain-history facts) is still NOT scanned.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCoachChatContext,
  COACH_CHAT_NOTES_SECTION_HEADER,
  extractCheckinNotes,
  findSafetyStop,
  type CoachChatUserData,
} from '../src/lib/coach-chat';

const BENIGN_MESSAGE = 'what should I train today?';

function baseUser(overrides: Partial<CoachChatUserData> = {}): CoachChatUserData {
  return {
    userName: 'Test',
    bodyweightKg: 80,
    unit: 'kg',
    goal: 'strength',
    experience: 'intermediate',
    daysPerWeek: 4,
    athleteFacts: [],
    lifts: [{ name: 'Squat', bestE1rmKg: 140, slopeKgPerWeek: 0.5, exposures: 9 }],
    painEpisodes: [],
    flaggedFamilies: [],
    activeBlock: null,
    adoptedPlanNames: [],
    todaySession: null,
    recentWorkouts: [{ date: '2026-10-28', name: 'Upper A', lifts: ['Bench Press'] }],
    prs: [],
    readiness: null,
    perMuscle: [],
    weeklyReviews: [],
    mealsToday: null,
    macroGoals: null,
    bodyMetricsLatest: null,
    checkinToday: { sleep: 4, soreness: 2, energy: 4 },
    ...overrides,
  };
}

describe('final-cert SEC F-01: notes-span safety scan', () => {
  it('evasion A: pain disclosure after a blank line INSIDE the notes is caught', () => {
    const contextText =
      `USER: Name: Test\n\n${COACH_CHAT_NOTES_SECTION_HEADER}\n` +
      `- Slept badly last night\n\n- Sharp pain in my left knee on stairs`;
    expect(extractCheckinNotes(contextText)).toContain('Sharp pain in my left knee');
    expect(findSafetyStop({ message: BENIGN_MESSAGE, history: [], contextText })).toBe('pain');
  });

  it('evasion A via a real built context: a multiline check-in note with a blank line is caught', () => {
    const user = baseUser({
      checkinToday: {
        sleep: 3,
        soreness: 4,
        energy: 3,
        notes: ['Felt strong on squats\n\nBut my shoulder pain came back after'],
      },
    });
    const ctx = buildCoachChatContext(user);
    expect(findSafetyStop({ message: BENIGN_MESSAGE, history: [], contextText: ctx.contextText })).toBe('pain');
  });

  it('evasion B: notes header NOT at a chunk start is caught', () => {
    const contextText =
      `SOME EARLIER SECTION: a summary line\n${COACH_CHAT_NOTES_SECTION_HEADER}\n- my ankle hurts since yesterday`;
    expect(extractCheckinNotes(contextText)).toContain('my ankle hurts');
    expect(findSafetyStop({ message: BENIGN_MESSAGE, history: [], contextText })).toBe('pain');
  });

  it('control: well-formed notes with a disclosure are still caught', () => {
    const user = baseUser({
      checkinToday: { sleep: 4, soreness: 5, energy: 3, notes: ['Knee pain got worse on stairs'] },
    });
    const ctx = buildCoachChatContext(user);
    expect(findSafetyStop({ message: BENIGN_MESSAGE, history: [], contextText: ctx.contextText })).toBe('pain');
  });

  it('the notes span stops at the next known section header (PAIN section text is not notes)', () => {
    const user = baseUser({
      painEpisodes: [{ exerciseName: 'Back Squat', date: '2026-10-20' }],
      flaggedFamilies: ['squat'],
      checkinToday: { sleep: 4, soreness: 2, energy: 4, notes: ['Slept well, ready to train'] },
    });
    const ctx = buildCoachChatContext(user);
    const notes = extractCheckinNotes(ctx.contextText);
    expect(notes).toBe('Slept well, ready to train');
    expect(notes).not.toContain('PAIN EPISODES');
  });

  it('SEC2-2 control: benign message + PAIN-scaffolding context → NO stop', () => {
    const user = baseUser({
      athleteFacts: [
        'Pain has come up on 3 separate days in the last month around squat movements (e.g. Back Squat) — your coach will steer clear of that pattern, and it\'s worth getting checked if it persists.',
      ],
      painEpisodes: [{ exerciseName: 'Back Squat', date: '2026-10-20' }],
      flaggedFamilies: ['squat'],
      checkinToday: { sleep: 3, soreness: 2, energy: 3, notes: ['Slept badly, feeling tired'] },
    });
    const ctx = buildCoachChatContext(user);
    expect(ctx.contextText).toContain('PAIN EPISODES ON RECORD');
    expect(findSafetyStop({ message: BENIGN_MESSAGE, history: [], contextText: ctx.contextText })).toBeNull();
  });
});
