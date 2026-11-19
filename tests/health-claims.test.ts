/**
 * M2 (bug program Phase 3) — health-claim filter behaviour.
 */
import { describe, expect, it } from 'vitest';
import { containsHealthClaim, scrubHealthClaims } from '../src/lib/health-claims';

describe('health-claim filter', () => {
  it('catches the gym-video pineapple claim verbatim', () => {
    const note =
      'Pineapple is rich in vitamin C and bromelain, which may support muscle recovery and reduce inflammation.';
    expect(containsHealthClaim(note)).toBe(true);
    // The whole sentence is one claim construction — it goes entirely.
    expect(scrubHealthClaims(note)).toBe('');
  });

  it('removes only the claiming sentence from a mixed note', () => {
    const note =
      'This meal gives you about 540 kcal and 32 g protein. The curd boosts immunity and improves gut health. Solid post-workout fuel.';
    const scrubbed = scrubHealthClaims(note);
    expect(scrubbed).toContain('540 kcal');
    expect(scrubbed).toContain('Solid post-workout fuel.');
    expect(scrubbed).not.toContain('immunity');
  });

  it('catches the standard claim families', () => {
    for (const claim of [
      'Turmeric is anti-inflammatory.',
      'This detoxifies your body naturally.',
      'It lowers cholesterol over time.',
      'Amla helps prevent diabetes.',
      'This smoothie burns fat fast.',
      'Ginger tea is good for your heart.',
      'It may reduce blood pressure.',
    ]) {
      expect(containsHealthClaim(claim), claim).toBe(true);
    }
  });

  it('leaves composition facts and goal language untouched', () => {
    for (const clean of [
      'Paneer gives you 18 g protein per 100 g.',
      'This supports your protein goal for today.',
      'A high-fibre meal that keeps you full longer.',
      'Great work — you beat last week\u2019s squat by 2.5 kg.',
      'Drink water and sleep well tonight.',
    ]) {
      expect(containsHealthClaim(clean), clean).toBe(false);
      expect(scrubHealthClaims(clean)).toBe(clean);
    }
  });
});
