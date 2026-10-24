/**
 * UX redesign Stage 7 — onboarding regression pins.
 *
 * Decision-doc requirements: all 9 steps kept, labeled guest path,
 * plan-offer Skip visually equal to Accept, summary screen before tabs
 * restating stored choices with an edit route to Training Preferences,
 * password rule visible before submit, typography tokens on step titles.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Stage 7 — onboarding', () => {
  it('all 9 screens are kept, plus the new summary screen', () => {
    const src = read('src/components/Onboarding.tsx');
    for (const id of [
      'splash',
      'welcome',
      'create_account',
      'login',
      'goals',
      'experience',
      'schedule',
      'details',
      'plan_offer',
      'summary',
    ]) {
      expect(src, `screen ${id} missing`).toContain(`'${id}'`);
    }
    expect(src).toContain("currentScreen === 'summary'");
    expect(src).toContain('<SummaryScreen');
  });

  it('accept, decline, and no-plan paths all route through the summary', () => {
    const src = read('src/components/Onboarding.tsx');
    expect(src.match(/setCurrentScreen\('summary'\)/g)?.length).toBeGreaterThanOrEqual(3);
    // completeOnboarding itself still exists for the summary buttons.
    expect(src).toContain('const completeOnboarding');
    expect(src).toContain('handleSummaryEdit');
    expect(src).toContain("navigate('settings'");
  });

  it('summary restates stored choices only (goal/level/days/diet/injuries)', () => {
    const src = read('src/components/onboarding/SummaryScreen.tsx');
    for (const key of [
      'onboarding.summaryGoal',
      'onboarding.summaryLevel',
      'onboarding.summaryDays',
      'onboarding.summaryDiet',
      'onboarding.summaryInjuries',
      'onboarding.summaryNoInjuries',
    ]) {
      expect(src, `summary missing ${key}`).toContain(key);
    }
    const ob = read('src/components/Onboarding.tsx');
    expect(ob).toContain('resolvePrimaryGoal(profile?.goals)');
    expect(ob).toContain('trainingProfile?.injuriesOrLimitations');
    expect(ob).toContain('trainingProfile?.daysPerWeek');
  });

  it('plan-offer Skip is visually equal to Accept (same geometry + weight)', () => {
    const src = read('src/components/Onboarding.tsx');
    const btnBefore = (key: string) => {
      const keyPos = src.indexOf(key);
      const start = src.lastIndexOf('<button', keyPos);
      return src.slice(start, src.indexOf('>', start));
    };
    const acceptBtn = btnBefore("t('onboarding.acceptPlan')");
    const declineBtn = btnBefore("t('onboarding.declinePlan')");
    for (const cls of ['w-full py-4 px-6 rounded-2xl', 'font-bold text-base']) {
      expect(acceptBtn, `Accept missing ${cls}`).toContain(cls);
      expect(declineBtn, `Skip missing ${cls}`).toContain(cls);
    }
    // Skip is a real button, not a discreet link.
    expect(declineBtn).not.toContain('underline');
  });

  it('guest path is a labeled first-class button with a data note', () => {
    const src = read('src/components/onboarding/WelcomeScreen.tsx');
    expect(src).not.toContain('Discreet Guest');
    expect(src).toContain("t('onboarding.continueAsGuest')");
    expect(src).toContain("t('onboarding.guestNote')");
    const keyPos = src.indexOf("t('onboarding.continueAsGuest')");
    const start = src.lastIndexOf('<button', keyPos);
    const btn = src.slice(start, src.indexOf('>', start));
    expect(btn).toContain('py-3.5 px-6');
    expect(btn).toContain('text-base');
  });

  it('password rule is visible before submit', () => {
    const src = read('src/components/onboarding/CreateAccountScreen.tsx');
    expect(src).toContain("t('auth.passwordLength')");
  });

  it('step titles use the design-system tokens', () => {
    for (const f of [
      'src/components/onboarding/FitnessGoalsScreen.tsx',
      'src/components/onboarding/ExperienceLevelScreen.tsx',
      'src/components/onboarding/ScheduleScreen.tsx',
      'src/components/onboarding/PersonalDetailsScreen.tsx',
    ]) {
      expect(read(f), `${f} not on page-title`).toContain('className="page-title"');
    }
    expect(read('src/components/onboarding/WelcomeScreen.tsx')).toContain('display-title');
    expect(read('src/components/Onboarding.tsx')).toContain('className="page-title"');
  });
});
