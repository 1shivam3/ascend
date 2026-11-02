import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PersonalDetailsScreen from '../src/components/onboarding/PersonalDetailsScreen';
import { useStore } from '../src/lib/store';
import { translate } from '../src/lib/i18n';
import { getInjuryBannedFamilies } from '../src/lib/workout-engine';

/**
 * Onboarding injuries dropdown — the owner's directive: a single
 * optional dropdown, default "No injuries", never blocking, with the
 * four areas only inside the dropdown (plus removable chips once the
 * user has actually picked something).
 *
 * Slop-tail correction (2026-11-02): this suite previously rendered
 * ScheduleScreen — a component Onboarding.tsx never mounts (the injury
 * control was copied verbatim into PersonalDetailsScreen, the screen
 * onboarding actually shows). The suite now renders the shipped
 * screen, so the two can no longer diverge silently. ScheduleScreen
 * itself was deleted as dead code in the same pass.
 *
 * Data-shape contract (critical): the dropdown writes the EXACT same
 * canonical labels the old chips wrote ('Lower back', 'Knees',
 * 'Shoulders', 'Wrists') into injuriesOrLimitations (string[]), so
 * the coach engine's regex-based injury exclusion reads them
 * identically. No migration is needed and previously saved injury
 * data still displays and still bans the same movement families.
 */

const noop = () => {};

function renderDetails(initialLimitations?: string[]) {
  return renderToStaticMarkup(
    <PersonalDetailsScreen
      initialName="Test Athlete"
      initialGender="male"
      initialDob="2000-01-15"
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
    const html = renderDetails();
    expect(html).toContain('id="injury-select"');
    expect(html).toContain('No injuries');
    // All four areas live ONLY as dropdown options now, never as buttons.
    for (const area of ['Lower back', 'Knees', 'Shoulders', 'Wrists']) {
      expect(html).toContain(`value="${area}"`);
    }
    // The old chip group used aria-pressed toggles; nothing on this
    // screen does, so any aria-pressed here would be an injury chip.
    expect(html).not.toContain('aria-pressed');
    expect(html).toContain('Continue');
    // Continue passes limitations straight through in the details
    // payload — no guard on them.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/components/onboarding/PersonalDetailsScreen.tsx'),
      'utf8',
    );
    expect(src).toContain('onContinue({');
    expect(src).toContain('limitations,');
    expect(src).not.toContain('toggleLimitation');
  });

  it('previously saved limitations still render as removable chips and stay out of the dropdown options', () => {
    const html = renderDetails(['Lower back', 'Knees']);
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
