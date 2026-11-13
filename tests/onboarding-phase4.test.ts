/**
 * Phase 4.1 — §25/§26 onboarding.
 *
 * §26: completion is a derivation (profile presence), not a
 * stored boolean. §25: the screen union holds only real screens;
 * the legacy deep-link values remap at parse time; a non-
 * sensitive resume point is persisted (screen id only).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  useStore,
  selectHasCompletedOnboarding,
  migratePersistedState,
  partializeAppState,
} from '@/lib/store';

describe('§26 derivation', () => {
  it('profile presence IS completion — the two can never disagree', () => {
    expect(selectHasCompletedOnboarding({ profile: null })).toBe(false);
    expect(
      selectHasCompletedOnboarding({ profile: { id: 'x' } as any }),
    ).toBe(true);
  });

  it('logout (profile nulled) reads not-completed without any flag write', () => {
    useStore.setState({ profile: { id: 'p1', name: 'A' } as any });
    expect(selectHasCompletedOnboarding(useStore.getState())).toBe(true);
    useStore.getState().logout({ clearLocalData: true });
    expect(useStore.getState().profile).toBeNull();
    expect(selectHasCompletedOnboarding(useStore.getState())).toBe(false);
  });

  it('migration drops the stored boolean; partialize never writes it', () => {
    const out = migratePersistedState(
      { profile: { id: 'p' }, hasCompletedOnboarding: false },
      3,
    ) as any;
    expect('hasCompletedOnboarding' in out).toBe(false);
    // The legacy blob above claimed "not completed" while holding
    // a profile — exactly the disagreement the derivation removes:
    expect(selectHasCompletedOnboarding({ profile: out.profile })).toBe(true);
    const p = partializeAppState(useStore.getState()) as any;
    expect('hasCompletedOnboarding' in p).toBe(false);
  });
});

describe('§25 screen union + deep links (source guards)', () => {
  const src = readFileSync('src/components/Onboarding.tsx', 'utf8');

  it("the union has no 'experience' or 'schedule' members", () => {
    const union = src.slice(
      src.indexOf('type OnboardingScreenId'),
      src.indexOf('const ONBOARDING_SCREENS'),
    );
    expect(union).not.toContain("'experience'");
    expect(union).not.toContain("'schedule'");
  });

  it('the legacy values still remap to details at parse time', () => {
    expect(src).toContain("screenParam === 'experience' || screenParam === 'schedule'");
    expect(src).toContain("setCurrentScreen('details')");
  });

  it('progress persistence is screen-id only, cleared on completion and logout', () => {
    expect(src).toContain("ONBOARDING_PROGRESS_KEY = 'ascend_onboarding_screen'");
    expect(src).toContain('localStorage.removeItem(ONBOARDING_PROGRESS_KEY)');
    const store = readFileSync('src/lib/store.ts', 'utf8');
    expect(store).toContain("localStorage.removeItem('ascend_onboarding_screen')");
  });
});
