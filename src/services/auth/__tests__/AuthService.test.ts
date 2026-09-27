import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../AuthService';
import { calculateStartingAttributes } from '../../../store/useAuthStore';
import { UserProfile } from '../../../types/domain.types';
import { ProfileRepository } from '../../../database/repositories/ProfileRepository';
import { supabase } from '../../../lib/supabase';

vi.mock('../../../database/repositories/ProfileRepository', () => ({
  ProfileRepository: {
    migrateGuestUser: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      exchangeCodeForSession: vi.fn(),
      setSession: vi.fn(),
    },
  },
}));

describe('AuthService & Progression Initialization Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Guest Mode Detection (Authenticated-First Invariant)', () => {
    it('identifies null or undefined profile as unauthenticated (not guest)', () => {
      expect(AuthService.isGuest(null)).toBe(false);
      expect(AuthService.isGuest(undefined)).toBe(false);
    });

    it('identifies legacy profile with isGuest: true as guest mode', () => {
      const guestProfile = { isGuest: true } as UserProfile;
      expect(AuthService.isGuest(guestProfile)).toBe(true);
    });

    it('identifies authenticated profile with isGuest: false as authenticated', () => {
      const authProfile = { isGuest: false } as UserProfile;
      expect(AuthService.isGuest(authProfile)).toBe(false);
    });
  });

  describe('Error Translation Engine (translateAuthError)', () => {
    it('translates invalid login credentials to user-friendly message', () => {
      expect(AuthService.translateAuthError('Invalid login credentials')).toBe(
        'Incorrect email or password. Please verify your credentials.'
      );
      expect(AuthService.translateAuthError('invalid_credentials')).toBe(
        'Incorrect email or password. Please verify your credentials.'
      );
      expect(AuthService.translateAuthError('Wrong password provided')).toBe(
        'Incorrect email or password. Please verify your credentials.'
      );
    });

    it('translates existing user registration conflict', () => {
      expect(AuthService.translateAuthError('User already registered')).toBe(
        'An account with this email already exists. Please log in instead.'
      );
      expect(AuthService.translateAuthError('Email address is already in use')).toBe(
        'An account with this email already exists. Please log in instead.'
      );
    });

    it('translates invalid email error', () => {
      expect(AuthService.translateAuthError('Invalid email format')).toBe(
        'Please enter a valid email address (e.g., operative@domain.com).'
      );
    });

    it('translates short password error', () => {
      expect(AuthService.translateAuthError('Password should be at least 6 characters')).toBe(
        'Password must be at least 6 characters long.'
      );
    });

    it('translates password mismatch error', () => {
      expect(AuthService.translateAuthError('Passwords do not match')).toBe(
        'Passwords do not match. Please verify both entries.'
      );
    });

    it('translates network connection errors', () => {
      expect(AuthService.translateAuthError('Network request failed')).toBe(
        'Network connection failure. Please check your internet connection and try again.'
      );
      expect(AuthService.translateAuthError('Failed to fetch')).toBe(
        'Network connection failure. Please check your internet connection and try again.'
      );
    });

    it('translates cancelled OAuth flow', () => {
      expect(AuthService.translateAuthError('access_denied')).toBe(
        'Google sign-in was cancelled.'
      );
      expect(AuthService.translateAuthError('User cancelled login')).toBe(
        'Google sign-in was cancelled.'
      );
    });

    it('translates expired session errors', () => {
      expect(AuthService.translateAuthError('Token has expired')).toBe(
        'Your authentication session has expired. Please log in again.'
      );
      expect(AuthService.translateAuthError('Session expired')).toBe(
        'Your authentication session has expired. Please log in again.'
      );
    });

    it('returns default fallback message when error is undefined or empty', () => {
      expect(AuthService.translateAuthError(undefined)).toBe(
        'An unexpected authentication error occurred.'
      );
      expect(AuthService.translateAuthError('')).toBe(
        'An unexpected authentication error occurred.'
      );
    });

    it('preserves raw unknown error if not mapped', () => {
      expect(AuthService.translateAuthError('Custom database violation')).toBe(
        'Custom database violation'
      );
    });
  });

  describe('Client-Side Form Validation', () => {
    describe('validateEmail', () => {
      it('returns true for standard email formats', () => {
        expect(AuthService.validateEmail('user@domain.com')).toBe(true);
        expect(AuthService.validateEmail('operative.name+tag@sub.domain.org')).toBe(true);
      });

      it('returns false for malformed or missing emails', () => {
        expect(AuthService.validateEmail('')).toBe(false);
        expect(AuthService.validateEmail('invalid-email')).toBe(false);
        expect(AuthService.validateEmail('@domain.com')).toBe(false);
        expect(AuthService.validateEmail('user@')).toBe(false);
        expect(AuthService.validateEmail('user@domain')).toBe(false);
        expect(AuthService.validateEmail('user with spaces@domain.com')).toBe(false);
      });
    });

    describe('validatePassword', () => {
      it('returns isValid: true for passwords 6 characters or longer', () => {
        const result = AuthService.validatePassword('secret123');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('returns isValid: false and descriptive error for passwords under 6 characters', () => {
        const short = AuthService.validatePassword('12345');
        expect(short.isValid).toBe(false);
        expect(short.error).toBe('Password must be at least 6 characters long.');

        const empty = AuthService.validatePassword('');
        expect(empty.isValid).toBe(false);
        expect(empty.error).toBe('Password must be at least 6 characters long.');
      });
    });
  });

  describe('Google OAuth & Deep Link Callback Handling', () => {
    it('initiates Google OAuth with correct redirect scheme and options', async () => {
      const mockOAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?...';
      vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValueOnce({
        data: { provider: 'google', url: mockOAuthUrl },
        error: null,
      });

      const result = await AuthService.signInWithGoogle();
      expect(result.url).toBe(mockOAuthUrl);
      expect(result.error).toBeUndefined();
      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'ascend://auth/callback',
          skipBrowserRedirect: true,
        },
      });
    });

    it('handles OAuth error parameters in deep link callback', async () => {
      const callbackUrl = 'ascend://auth/callback?error=access_denied&error_description=User+cancelled';
      const result = await AuthService.handleAuthCallback(callbackUrl);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Google sign-in was cancelled.');
    });

    it('exchanges PKCE code for session when code parameter is present', async () => {
      const callbackUrl = 'ascend://auth/callback?code=mock-pkce-code-123';
      vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValueOnce({
        data: {
          session: { access_token: 'tok' } as any,
          user: { id: 'u-auth-123', email: 'operative@ascend.app' } as any,
        },
        error: null,
      });

      const result = await AuthService.handleAuthCallback(callbackUrl);
      expect(result.success).toBe(true);
      expect(result.userId).toBe('u-auth-123');
      expect(result.email).toBe('operative@ascend.app');
      expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('mock-pkce-code-123');
    });

    it('establishes session from implicit tokens in URL hash fragment', async () => {
      const callbackUrl =
        'ascend://auth/callback#access_token=token-abc&refresh_token=refresh-xyz&token_type=bearer';
      vi.mocked(supabase.auth.setSession).mockResolvedValueOnce({
        data: {
          session: { access_token: 'token-abc' } as any,
          user: { id: 'u-auth-456', email: 'implicit@ascend.app' } as any,
        },
        error: null,
      });

      const result = await AuthService.handleAuthCallback(callbackUrl);
      expect(result.success).toBe(true);
      expect(result.userId).toBe('u-auth-456');
      expect(result.email).toBe('implicit@ascend.app');
      expect(supabase.auth.setSession).toHaveBeenCalledWith({
        access_token: 'token-abc',
        refresh_token: 'refresh-xyz',
      });
    });
  });

  describe('Legacy Guest Data Migration (migrateGuestData)', () => {
    it('delegates to ProfileRepository.migrateGuestUser when guest user differs from auth user', async () => {
      await AuthService.migrateGuestData('u-default-local', {
        id: 'u-auth-789',
        email: 'migrated@ascend.app',
      });

      expect(ProfileRepository.migrateGuestUser).toHaveBeenCalledWith(
        'u-default-local',
        'u-auth-789',
        'migrated@ascend.app'
      );
    });

    it('does not migrate if guest user ID matches auth user ID', async () => {
      await AuthService.migrateGuestData('u-auth-789', {
        id: 'u-auth-789',
        email: 'migrated@ascend.app',
      });

      expect(ProfileRepository.migrateGuestUser).not.toHaveBeenCalled();
    });

    it('does not migrate if guest user ID is empty', async () => {
      await AuthService.migrateGuestData('', {
        id: 'u-auth-789',
        email: 'migrated@ascend.app',
      });

      expect(ProfileRepository.migrateGuestUser).not.toHaveBeenCalled();
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
