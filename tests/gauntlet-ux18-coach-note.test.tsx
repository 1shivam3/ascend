import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/lib/store';
import { getLocalTodayStr } from '@/lib/formatters';
import { translate } from '@/lib/i18n';
import type { ManualCheckin } from '@/lib/coach-engine';

/**
 * Gauntlet UX-18 (user decision 2026-10-29): the Coach tab check-in
 * gets a typing box alongside the answer chips.
 *
 * Harness note: this repo's component tests are SSR-only and the
 * zustand server snapshot is frozen at module init, so a seeded
 * mid-chat render cannot be produced here (verified: setState before
 * renderToStaticMarkup does not change the markup). Interaction-level
 * coverage therefore splits into: store round-trips (the record the
 * note lands on), i18n resolution, and source-contract assertions —
 * the same pattern tests/onboarding-injuries-dropdown uses. The chips
 * flow itself is unchanged code, covered by
 * tests/coach-chat-tab.test.tsx and the coach-session tests.
 */

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../src/components/CoachChatTab.tsx'),
  'utf8'
);

beforeEach(() => {
  useStore.setState({ dailyCheckins: {} });
});

describe('UX-18 — notes land on the check-in record', () => {
  it('setDailyCheckin round-trips notes keyed by step id', () => {
    const today = getLocalTodayStr();
    const checkin: ManualCheckin = {
      sleep: 4,
      soreness: 2,
      energy: 7,
      notes: { sleep: 'Woke up twice in the night' },
    };
    useStore.getState().setDailyCheckin(today, checkin);
    const saved = useStore.getState().dailyCheckins[today];
    expect(saved?.notes?.sleep).toBe('Woke up twice in the night');
    // The structured answers are stored exactly as before.
    expect(saved?.sleep).toBe(4);
    expect(saved?.energy).toBe(7);
  });

  it('a check-in without notes still reads back cleanly (older records)', () => {
    const today = getLocalTodayStr();
    useStore.getState().setDailyCheckin(today, { sleep: 3, soreness: 3, energy: 6 });
    expect(useStore.getState().dailyCheckins[today]?.notes).toBeUndefined();
  });

  it('the component seeds its notes state from the saved check-in (thread restore)', () => {
    // mostRecentCheckin is component-local; the seed wiring is the
    // contract: notes state initialises from the seed's notes.
    expect(SRC).toContain('...(seed?.notes ?? {})');
    expect(SRC).toContain('setNotes({ ...(next.notes ?? {}) })');
  });
});

describe('UX-18 — typing box wiring (source contract)', () => {
  it('renders a text input with the i18n placeholder and Send label', () => {
    expect(SRC).toContain("t('coachChat.notePlaceholder')");
    expect(SRC).toContain("t('coachChat.noteSend')");
    expect(translate('en', 'coachChat.notePlaceholder')).toBe(
      'Add a note for your coach (optional)'
    );
    expect(translate('en', 'coachChat.noteSend')).toBe('Send');
    expect(translate('hi', 'coachChat.notePlaceholder')).not.toBe(
      'coachChat.notePlaceholder'
    );
    expect(translate('hi', 'coachChat.noteSend')).not.toBe('coachChat.noteSend');
  });

  it('caps the note at 500 chars (attribute and submit-time slice)', () => {
    expect(SRC).toContain('maxLength={500}');
    expect(SRC).toContain('.slice(0, 500)');
  });

  it('submitting records the note under the CURRENT step via the same save path as chips', () => {
    expect(SRC).toContain('saveCheckin({ notes: next })');
    expect(SRC).toContain('[currentStep]: text');
    // saveCheckin's base record carries notes, so chip answers saved
    // afterwards never wipe a note (and vice versa).
    expect(SRC).toContain('painAreas,\n      notes,\n      ...patch,');
  });

  it('notes render as user bubbles in the thread (completed pairs and current question)', () => {
    expect(SRC).toContain('{notes[step] && <UserBubble>{notes[step]}</UserBubble>}');
    expect(SRC).toContain(
      '{notes[currentStep] && <UserBubble>{notes[currentStep]}</UserBubble>}'
    );
  });

  it('the note never answers a question: submitNote does not advance the step', () => {
    const start = SRC.indexOf('const submitNote');
    const end = SRC.indexOf('};', start);
    const body = SRC.slice(start, end);
    expect(body).not.toContain('setStepIndex');
    expect(body).not.toContain('advance');
  });
});
