import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ScheduleScreen from '../src/components/onboarding/ScheduleScreen';
import { useStore } from '../src/lib/store';
import { translate } from '../src/lib/i18n';
import { getInjuryBannedFamilies } from '../src/lib/workout-engine';

/**
 * Onboarding injuries dropdown — the schedule step used to parade four
 * injury toggle chips in front of EVERY user. Now it shows a single
 * optional dropdown: default "No injuries", never blocking, and the
 * four areas only appear inside the dropdown (plus removable chips
 * once the user has actually picked something).
 *
 * Data-shape contract (critical): the dropdown writes the EXACT same
 * canonical labels the old chips wrote ('Lower back', 'Knees',
 * 'Shoulders', 'Wrists') into injuriesOrLimitations (string[]), so
 * the coach engine's regex-based injury exclusion reads them
 * identically. No migration is needed and previously saved injury
 * data still displays and still bans the same movement families.
 */

const noop = () => {};

function renderSchedule(initialLimitations?: string[]) {
  return renderToStaticMarkup(
    <ScheduleScreen
      initialDays={4}
      initialEquipment="full_gym"
      initialActivity="light"
      initialLimitations={initialLimitations}
      onContinue={noop}
      onBack={noop}
    />,
  );
}

describe('onboarding injuries dropdown', () => {
  beforeEach(() => {
    useStore.getState().setUiPreferences({ language: 'en' });
  });

  it('no-injury default: one dropdown reading "No injuries", no injury toggle buttons, Continue unblocked', () => {
    const html = renderSchedule();
    expect(html).toContain('<select');
    expect(html).toContain('No injuries');
    // All four areas live ONLY as dropdown options now, never as buttons.
    for (const area of ['Lower back', 'Knees', 'Shoulders', 'Wrists']) {
      expect(html).toContain(`value="${area}"`);
    }
    // The old chip group used aria-pressed toggles; day/equipment use
    // radio roles, so any aria-pressed here would be an injury chip.
    expect(html).not.toContain('aria-pressed');
    expect(html).toContain('Continue');
    // Continue passes limitations straight through — no guard on them.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/components/onboarding/ScheduleScreen.tsx'),
      'utf8',
    );
    expect(src).toContain('onContinue(days, equipment, activity, limitations)');
    expect(src).not.toContain('toggleLimitation');
  });

  it('previously saved limitations still render as removable chips and stay out of the dropdown options', () => {
    const html = renderSchedule(['Lower back', 'Knees']);
    // Old saved data displays (backward compatible) and can be removed.
    expect(html).toContain('Remove Lower back');
    expect(html).toContain('Remove Knees');
    expect(html).toContain('Add another injury…');
    // Already-picked areas are not offered again in the dropdown.
    expect(html).not.toContain('value="Lower back"');
    expect(html).not.toContain('value="Knees"');
    expect(html).toContain('value="Shoulders"');
    expect(html).toContain('value="Wrists"');
  });

  it('dropdown values map to the same coach injury bans as the old chips (data shape preserved)', () => {
    expect([...getInjuryBannedFamilies(['Lower back'])]).toEqual(['hinge']);
    expect([...getInjuryBannedFamilies(['Knees'])]).toEqual(['squat']);
    expect([...getInjuryBannedFamilies(['Shoulders'])]).toEqual(['vertical_push']);
    // Wrists: recorded and surfaced, no generic ban — same as before.
    expect(getInjuryBannedFamilies(['Wrists']).size).toBe(0);
    expect(getInjuryBannedFamilies([]).size).toBe(0);
    expect(
      getInjuryBannedFamilies(['Lower back', 'Knees', 'Shoulders', 'Wrists']).size,
    ).toBe(3);
  });

  it('new injury strings exist in English and Hindi with parity', () => {
    expect(translate('en', 'onboarding.injuriesTitle')).toBe(
      'Any injuries or sore joints we should plan around?',
    );
    expect(translate('en', 'onboarding.injuriesHint')).toBe(
      'Pick any that apply — your plan will avoid movements that load them. Leave empty if none.',
    );
    expect(translate('en', 'onboarding.injuriesNone')).toBe('No injuries');
    expect(translate('en', 'onboarding.injuriesAdd')).toBe('Add another injury…');
    expect(translate('en', 'onboarding.injuriesRemove', { area: 'Knees' })).toBe(
      'Remove Knees',
    );
    expect(translate('hi', 'onboarding.injuriesTitle')).toBe(
      'कोई चोट या दर्द वाले जोड़ हैं जिनका प्लान में ध्यान रखना है?',
    );
    expect(translate('hi', 'onboarding.injuriesNone')).toBe('कोई चोट नहीं');
    expect(translate('hi', 'onboarding.injuriesAdd')).toBe('एक और चोट जोड़ें…');
    expect(translate('hi', 'onboarding.injuriesRemove', { area: 'Knees' })).toContain(
      'हटाएं',
    );
    expect(translate('hi', 'onboarding.injuriesTitle')).not.toBe(
      translate('en', 'onboarding.injuriesTitle'),
    );
  });
});
