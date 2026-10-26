import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach } from 'vitest';
import CoachChatTab from '../src/components/CoachChatTab';
import { useStore } from '../src/lib/store';
import { translate } from '../src/lib/i18n';

/**
 * Coach tab smoke tests (2026-10-26).
 * SSR renders the store's INITIAL state (zustand's server snapshot),
 * so the render case covers the fresh-user path: no plans yet →
 * no-plan card. Session logic itself is covered by
 * coach-session.test.ts; i18n parity is asserted via translate().
 */
describe('CoachChatTab', () => {
  beforeEach(() => {
    useStore.getState().setUiPreferences({ language: 'en' });
  });

  it('renders the no-plan card for a fresh user without crashing', () => {
    const html = renderToStaticMarkup(
      <CoachChatTab
        onStartPlan={() => {}}
        onBuildBlock={() => {}}
        onReviewBlock={() => {}}
        onOpenWeeklyReview={() => {}}
        onOpenDebrief={() => {}}
      />
    );
    expect(html).toContain('No plan yet');
    expect(html).toContain('Build my block');
    expect(html).toContain('Your coach designs');
  });

  it('every coachChat key resolves in English and Hindi (no raw keys)', () => {
    const keys = [
      'coachChat.intro',
      'coachChat.noPlanTitle',
      'coachChat.noPlanBody',
      'coachChat.buildBlock',
      'coachChat.checkinTitle',
      'coachChat.sameAsUsual',
      'coachChat.chatEdit',
      'coachChat.chatSleepQ',
      'coachChat.chatFreshQ',
      'coachChat.chatAreasQ',
      'coachChat.chatAreasDone',
      'coachChat.chatAreasNone',
      'coachChat.chatEnergyQ',
      'coachChat.chatMinutesQ',
      'coachChat.chatMinutesShort',
      'coachChat.chatLocationQ',
      'coachChat.locationGym',
      'coachChat.locationHome',
      'coachChat.chatPainQ',
      'coachChat.chatPainNo',
      'coachChat.chatPainYes',
      'coachChat.painStopTitle',
      'coachChat.painStopBody',
      'coachChat.restToday',
      'coachChat.trainAroundIt',
      'coachChat.restNote',
      'coachChat.reasonPrimed',
      'coachChat.reasonReady',
      'coachChat.reasonCaution',
      'coachChat.reasonRest',
      'coachChat.setsCut',
      'coachChat.needsGym',
      'coachChat.emptySession',
      'coachChat.startSession',
      'coachChat.whyThis',
      'coachChat.weeklyTitle',
      'coachChat.weeklyShrink',
      'coachChat.weeklyProgress',
      'coachChat.weeklyHold',
      'coachChat.openFullReview',
      'coachChat.safetyNote',
    ] as const;
    for (const key of keys) {
      expect(translate('en', key)).not.toBe(key);
      expect(translate('hi', key)).not.toBe(key);
    }
    expect(translate('en', 'train.coach')).toBe('Coach');
    expect(translate('hi', 'train.coach')).toBe('कोच');
    expect(
      translate('en', 'coachChat.proteinTitle', { min: 112, max: 154 })
    ).toContain('112');
    expect(
      translate('en', 'coachChat.weeklyAdherence', { done: 3, planned: 4 })
    ).toContain('3 of 4');
  });
});
