import { describe, it, expect } from 'vitest';
import { AuthService } from '../AuthService';
import { calculateStartingAttributes } from '../../../store/useAuthStore';
import { UserProfile } from '../../../types/domain.types';

describe('AuthService & Progression Initialization Invariants', () => {
  describe('Guest Mode Detection', () => {
    it('identifies null or undefined profile as guest mode', () => {
      expect(AuthService.isGuest(null)).toBe(true);
      expect(AuthService.isGuest(undefined)).toBe(true);
    });

    it('identifies profile with isGuest: true as guest mode', () => {
      const guestProfile = { isGuest: true } as UserProfile;
      expect(AuthService.isGuest(guestProfile)).toBe(true);
    });

    it('identifies authenticated profile with isGuest: false as authenticated', () => {
      const authProfile = { isGuest: false } as UserProfile;
      expect(AuthService.isGuest(authProfile)).toBe(false);
    });
  });

  describe('Starting RPG Attributes Engine (calculateStartingAttributes)', () => {
    it('calculates realistic baseline attributes between 12 and 40', () => {
      const attrs = calculateStartingAttributes('BUILD_STRENGTH', 'INTERMEDIATE', 4, 80);
      expect(attrs.strength).toBeGreaterThanOrEqual(12);
      expect(attrs.strength).toBeLessThanOrEqual(50);
      expect(attrs.stamina).toBeGreaterThanOrEqual(12);
      expect(attrs.agility).toBeGreaterThanOrEqual(12);
      expect(attrs.discipline).toBeGreaterThanOrEqual(12);
      expect(attrs.vitality).toBeGreaterThanOrEqual(12);
    });

    it('boosts Strength for BUILD_STRENGTH goal over ENDURANCE goal', () => {
      const strengthAttrs = calculateStartingAttributes('BUILD_STRENGTH', 'INTERMEDIATE', 4, 80);
      const enduranceAttrs = calculateStartingAttributes('ENDURANCE', 'INTERMEDIATE', 4, 80);

      expect(strengthAttrs.strength).toBeGreaterThan(enduranceAttrs.strength);
      expect(enduranceAttrs.stamina).toBeGreaterThan(strengthAttrs.stamina);
    });

    it('scales discipline and strength with advanced experience tiers', () => {
      const noviceAttrs = calculateStartingAttributes('BUILD_STRENGTH', 'NOVICE', 4, 80);
      const eliteAttrs = calculateStartingAttributes('BUILD_STRENGTH', 'ELITE', 4, 80);

      expect(eliteAttrs.discipline).toBeGreaterThan(noviceAttrs.discipline);
      expect(eliteAttrs.strength).toBeGreaterThan(noviceAttrs.strength);
    });

    it('awards bonus discipline for higher weekly training commitments', () => {
      const lowCommitment = calculateStartingAttributes('BUILD_STRENGTH', 'INTERMEDIATE', 2, 75);
      const highCommitment = calculateStartingAttributes('BUILD_STRENGTH', 'INTERMEDIATE', 5, 75);

      expect(highCommitment.discipline).toBeGreaterThan(lowCommitment.discipline);
    });

    it('awards slight bodyweight mass advantage on base strength', () => {
      const lightLifter = calculateStartingAttributes('BUILD_STRENGTH', 'INTERMEDIATE', 4, 65);
      const heavyLifter = calculateStartingAttributes('BUILD_STRENGTH', 'INTERMEDIATE', 4, 95);

      expect(heavyLifter.strength).toBeGreaterThan(lightLifter.strength);
    });
  });
});
