/**
 * Task 1.1: the onboarding details screen now ASKS weight/height
 * (previously the simplified flow never asked and targets were seeded
 * from placeholders). SSR render coverage: the inputs, the unit
 * switch, and the explicit "I'll add this later" skip render; the
 * submit-time validation/conversion itself is unit-tested in
 * tests/body-stats.test.ts (validateBodyStats / toStoredBodyStats),
 * and the skip → no-target behavior is covered there via
 * effectiveMacroGoals.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach } from 'vitest';
import PersonalDetailsScreen from '../src/components/onboarding/PersonalDetailsScreen';
import { useStore } from '../src/lib/store';

describe('PersonalDetailsScreen body stats (Task 1.1)', () => {
  beforeEach(() => {
    useStore.getState().setUiPreferences({ language: 'en' });
  });

  it('renders weight/height inputs, the unit switch, and the explicit skip', () => {
    const html = renderToStaticMarkup(
      <PersonalDetailsScreen onContinue={() => {}} onBack={() => {}} />
    );
    expect(html).toContain('Weight &amp; height');
    expect(html).toContain('id="details-weight"');
    expect(html).toContain('id="details-height"');
    expect(html).toContain('KG / CM');
    expect(html).toContain('LBS / IN');
    expect(html).toContain('I&#x27;ll add this later');
    // The skip is explicit: no "skipped" note until it is tapped.
    expect(html).not.toContain('no food target is calculated');
  });

  it('renders the skipped state note when returning after a skip', () => {
    const html = renderToStaticMarkup(
      <PersonalDetailsScreen
        onContinue={() => {}}
        onBack={() => {}}
        initialBodyStatsSkipped
      />
    );
    expect(html).toContain('no food target is calculated');
  });

  it('renders previously entered stats on back-navigation', () => {
    const html = renderToStaticMarkup(
      <PersonalDetailsScreen
        onContinue={() => {}}
        onBack={() => {}}
        initialWeight="82"
        initialHeight="181"
      />
    );
    expect(html).toContain('value="82"');
    expect(html).toContain('value="181"');
  });
});
