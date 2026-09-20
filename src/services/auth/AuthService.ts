import { supabase } from '../../lib/supabase';
import { ProfileRepository } from '../../database/repositories/ProfileRepository';
import { UserProfile } from '../../types/domain.types';

export interface AuthResult {
  success: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

export class AuthService {
  /**
   * Evaluates if a profile is currently operating in local Guest Mode.
   */
  static isGuest(profile: UserProfile | null | undefined): boolean {
    if (!profile) return true;
    return Boolean(profile.isGuest);
  }

  /**
   * Creates a new Supabase authenticated user with email and password.
   */
  static async signUp(
    email: string,
    password: string,
    displayName?: string
  ): Promise<AuthResult> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || 'Vanguard Operative',
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: 'Registration failed to create user identity.' };
      }

      return {
        success: true,
        userId: data.user.id,
        email: data.user.email || email,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error during sign-up';
      return { success: false, error: message };
    }
  }

  /**
   * Signs into an existing Supabase authenticated account.
   */
  static async signIn(email: string, password: string): Promise<AuthResult> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: 'Sign-in failed to locate user session.' };
      }

      return {
        success: true,
        userId: data.user.id,
        email: data.user.email || email,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error during sign-in';
      return { success: false, error: message };
    }
  }

  /**
   * Prepares OAuth architecture for Google Sign-In.
   */
  static async signInWithGoogle(): Promise<{ url?: string; error?: string }> {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'ascend://auth/callback',
          skipBrowserRedirect: true,
        },
      });

      if (error) return { error: error.message };
      return { url: data.url };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google OAuth initialization failed';
      return { error: message };
    }
  }

  /**
   * Terminates active authenticated Supabase session.
   */
  static async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Supabase sign-out warning:', err);
    }
  }

  /**
   * Safely migrates all local guest data (profile, workouts, sets, mastery, PRs, XP)
   * into the newly authenticated Supabase user account, ensuring zero duplicate profiles.
   */
  static async migrateGuestData(
    guestUserId: string,
    authUser: { id: string; email?: string }
  ): Promise<void> {
    if (guestUserId === authUser.id) {
      return;
    }

    await ProfileRepository.migrateGuestUser(guestUserId, authUser.id, authUser.email);
  }

  /**
   * Retrieves active Supabase session if authenticated.
   */
  static async getCurrentSession() {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session;
    } catch {
      return null;
    }
  }
}
