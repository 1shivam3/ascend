import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { translate } from '../src/lib/i18n';
import { en } from '../src/lib/i18n/en';
import CoachNotesSection from '../src/components/CoachNotesSection';
import DietPreferencePicker from '../src/components/DietPreferencePicker';

function src(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('UX discoverability: new i18n keys resolve in both languages', () => {
  const NEW_KEYS = [
    'home.coachNotes',
    'home.coachNotesMissed',
    'home.coachNotesCalories',
    'home.coachNotesNextSession',
    'ui.seeAll',
    'auth.googleSignInIncomplete',
  ] as const;

  it.each(NEW_KEYS)('%s resolves to real copy in en and hi', (key) => {
    expect(translate('en', key)).not.toBe(key);
    expect(translate('en', key).length).toBeGreaterThan(0);
    expect(translate('hi', key)).not.toBe(key);
    expect(translate('hi', key).length).toBeGreaterThan(0);
  });

  it('the neutral sign-in copy says what happened and what to do', () => {
    expect(translate('en', 'auth.googleSignInIncomplete')).toBe(
      "Google sign-in didn't complete — try again"
    );
  });
});

describe('UX discoverability: CoachNotesSection collapse logic', () => {
  const checkIn = React.createElement('div', null, 'CHECKIN BODY');
  const nutrition = React.createElement('div', null, 'NUTRITION BODY');
  const adjustments = React.createElement('div', null, 'ADJUSTMENTS BODY');

  it('shows the first card fully and hides the rest behind taps', () => {
    const html = renderToStaticMarkup(
      React.createElement(CoachNotesSection, { checkIn, nutrition, adjustments })
    );
    expect(html).toContain('Coach notes');
    expect(html).toContain('CHECKIN BODY');
    // Collapsed items render their label row only — bodies stay hidden
    // until the user taps.
    expect(html).toContain('Calorie suggestion');
    expect(html).toContain('Next session');
    expect(html).not.toContain('NUTRITION BODY');
    expect(html).not.toContain('ADJUSTMENTS BODY');
  });

  it('renders only the present cards, in order, with no empty section', () => {
    const onlyNutrition = renderToStaticMarkup(
      React.createElement(CoachNotesSection, { checkIn: false, nutrition, adjustments: false })
    );
    expect(onlyNutrition).toContain('NUTRITION BODY');
    expect(onlyNutrition).not.toContain('Calorie suggestion');

    const empty = renderToStaticMarkup(
      React.createElement(CoachNotesSection, { checkIn: false, nutrition: false, adjustments: false })
    );
    expect(empty).toBe('');
  });
});

describe('UX discoverability: DietPreferencePicker renders the shared picker', () => {
  it('shows all four diet options with the Settings heading', () => {
    const html = renderToStaticMarkup(React.createElement(DietPreferencePicker));
    expect(html).toContain('Diet Preference');
    expect(html).toContain('Vegetarian');
    expect(html).toContain('Eggetarian');
    expect(html).toContain('Non-Vegetarian');
    expect(html).toContain('Vegan');
  });
});

describe('UX discoverability: placement wiring (source assertions)', () => {
  it('Today header has a Settings gear next to the bell', () => {
    const home = src('src/components/HomePage.tsx');
    expect(home).toContain("onNavigate('settings')");
    expect(home).toContain('CoachNotesSection');
  });

  it('Settings has section chips, a notifications home, and the shared diet picker', () => {
    const settings = src('src/components/SettingsView.tsx');
    expect(settings).toContain('scrollToSection');
    expect(settings).toContain('ReminderCenterModal');
    expect(settings).toContain('DietPreferencePicker');
    // The mid-page medical wall of text is gone; the Disclaimer row
    // (linked above it) carries the meaning instead.
    expect(settings).not.toContain("t('settings.medicalNote')");
  });

  it('Fuel surfaces the diet picker and hides target math behind a detail tap', () => {
    const meals = src('src/components/MealsPage.tsx');
    expect(meals).toContain('DietPreferencePicker');
    expect(meals).toContain('<CollapsibleDetails label={t(\'meals.why\')} className="w-full">');
    expect(meals).toContain('meals.sugarNote');
  });

  it('Train collapses the non-enrolled Running intro and keeps the ledger advanced-gated', () => {
    const workout = src('src/components/WorkoutPage.tsx');
    expect(workout).toContain('isRunIntroOpen');
    expect(workout).toContain('{userMode === \'advanced\' && (activePolicyDecision');
  });

  it('OAuth errors map to neutral copy; honest inventory text is untouched', () => {
    const onboarding = src('src/components/Onboarding.tsx');
    expect(onboarding).not.toContain('decodeURIComponent(oauthError');
    expect(onboarding).toContain('auth.googleSignInIncomplete');
    expect(src('src/components/onboarding/SocialAuthButtons.tsx')).toContain(
      'auth.googleSignInIncomplete'
    );
    expect(src('src/components/AuthModal.tsx')).toContain('auth.googleSignInIncomplete');
    expect(src('src/lib/supabase/sync.ts')).toContain('google_signin_incomplete');
    // del.identityBody is honest delete-account inventory, NOT part of
    // this fix — it must still name Supabase Auth.
    expect(en['del.identityBody']).toContain('Supabase Auth');
  });
});
