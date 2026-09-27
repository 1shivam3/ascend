import * as Linking from 'expo-linking';
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
   * Translates raw Supabase or network error strings into user-friendly messages.
   */
  static translateAuthError(rawError: string | undefined): string {
    if (!rawError) return 'An unexpected authentication error occurred.';
    const lower = rawError.toLowerCase();

    if (
      lower.includes('invalid login credentials') ||
      lower.includes('invalid_credentials') ||
      lower.includes('wrong password')
    ) {
      return 'Incorrect email or password. Please verify your credentials.';
    }

    if (
      lower.includes('user already registered') ||
      lower.includes('already exists') ||
      lower.includes('email address is already in use')
    ) {
      return 'An account with this email already exists. Please log in instead.';
    }

    if (lower.includes('invalid email') || lower.includes('valid email')) {
      return 'Please enter a valid email address (e.g., operative@domain.com).';
    }

    if (
      lower.includes('password') &&
      (lower.includes('short') || lower.includes('at least') || lower.includes('characters'))
    ) {
      return 'Password must be at least 6 characters long.';
    }

    if (lower.includes('passwords do not match')) {
      return 'Passwords do not match. Please verify both entries.';
    }

    if (
      lower.includes('network') ||
      lower.includes('failed to fetch') ||
      lower.includes('timeout') ||
      lower.includes('connection')
    ) {
      return 'Network connection failure. Please check your internet connection and try again.';
    }

    if (
      lower.includes('cancel') ||
      lower.includes('access_denied') ||
      lower.includes('user cancelled')
    ) {
      return 'Google sign-in was cancelled.';
    }

    if (
      lower.includes('expired') ||
      lower.includes('token has expired') ||
      lower.includes('session expired')
    ) {
      return 'Your authentication session has expired. Please log in again.';
    }

    return rawError;
  }

  /**
   * Validates email format.
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test((email || '').trim());
  }

  /**
   * Validates password strength (minimum 6 characters).
   */
  static validatePassword(password: string): { isValid: boolean; error?: string } {
    if (!password || password.length < 6) {
      return { isValid: false, error: 'Password must be at least 6 characters long.' };
    }
    return { isValid: true };
  }

  /**
   * Evaluates if a profile is currently operating in local Guest Mode.
   */
  static isGuest(profile: UserProfile | null | undefined): boolean {
    if (!profile) return false;
    return Boolean(profile.isGuest);
  }

  /**
   * Creates a new Supabase authenticated user with email and password.
   */
  static async signUp(
    email: string,
    password: string,
    confirmPassword?: string,
    displayName?: string
  ): Promise<AuthResult> {
    const cleanEmail = (email || '').trim();

    if (!this.validateEmail(cleanEmail)) {
      return {
        success: false,
        error: this.translateAuthError('invalid email'),
      };
    }

    const passCheck = this.validatePassword(password);
    if (!passCheck.isValid) {
      return {
        success: false,
        error: passCheck.error,
      };
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return {
        success: false,
        error: this.translateAuthError('passwords do not match'),
      };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            display_name: displayName || 'Vanguard Operative',
          },
        },
      });

      if (error) {
        return { success: false, error: this.translateAuthError(error.message) };
      }

      if (!data.user) {
        return { success: false, error: 'Registration failed to create user identity.' };
      }

      return {
        success: true,
        userId: data.user.id,
        email: data.user.email || cleanEmail,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error during sign-up';
      return { success: false, error: this.translateAuthError(message) };
    }
  }

  /**
   * Signs into an existing Supabase authenticated account.
   */
  static async signIn(email: string, password: string): Promise<AuthResult> {
    const cleanEmail = (email || '').trim();

    if (!this.validateEmail(cleanEmail)) {
      return {
        success: false,
        error: this.translateAuthError('invalid email'),
      };
    }

    if (!password) {
      return {
        success: false,
        error: 'Password is required.',
      };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        return { success: false, error: this.translateAuthError(error.message) };
      }

      if (!data.user) {
        return { success: false, error: 'Sign-in failed to locate user session.' };
      }

      return {
        success: true,
        userId: data.user.id,
        email: data.user.email || cleanEmail,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error during sign-in';
      return { success: false, error: this.translateAuthError(message) };
    }
  }

  /**
   * Prepares OAuth architecture for Google Sign-In with Expo deep-link redirect.
   */
  static async signInWithGoogle(): Promise<{ url?: string; error?: string }> {
    try {
      const redirectUrl = Linking.createURL('auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) return { error: this.translateAuthError(error.message) };
      if (!data?.url) return { error: 'Failed to generate Google authorization URL.' };

      return { url: data.url };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google OAuth initialization failed';
      return { error: this.translateAuthError(message) };
    }
  }

  /**
   * Handles deep-link redirect callback from Google OAuth.
   * Parses either PKCE code or access/refresh tokens and completes session establishment.
   */
  static async handleAuthCallback(url: string): Promise<AuthResult> {
    try {
      if (url.includes('error=') || url.includes('error_description=')) {
        const parsed = Linking.parse(url);
        const errorDesc =
          (parsed.queryParams?.error_description as string) ||
          (parsed.queryParams?.error as string) ||
          'user cancelled';
        return {
          success: false,
          error: this.translateAuthError(errorDesc),
        };
      }

      // 1. Check for PKCE authorization code in query parameters
      if (url.includes('code=')) {
        const parsed = Linking.parse(url);
        const code = parsed.queryParams?.code as string;
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            return { success: false, error: this.translateAuthError(error.message) };
          }
          if (data?.user) {
            return { success: true, userId: data.user.id, email: data.user.email };
          }
        }
      }

      // 2. Check for implicit grant tokens in hash fragments
      if (url.includes('access_token=') && url.includes('refresh_token=')) {
        const hashIndex = url.indexOf('#');
        const hash = hashIndex !== -1 ? url.substring(hashIndex + 1) : url;
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            return { success: false, error: this.translateAuthError(error.message) };
          }
          if (data?.user) {
            return { success: true, userId: data.user.id, email: data.user.email };
          }
        }
      }

      // 3. Fallback: check if session is already active in Supabase
      const session = await this.getCurrentSession();
      if (session?.user) {
        return { success: true, userId: session.user.id, email: session.user.email };
      }

      return {
        success: false,
        error: 'Google authentication could not be completed.',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error processing authentication callback';
      return { success: false, error: this.translateAuthError(message) };
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
   * Safely migrates all local legacy guest data (profile, workouts, sets, mastery, PRs, XP)
   * into the newly authenticated Supabase user account, ensuring zero duplicate profiles.
   */
  static async migrateGuestData(
    guestUserId: string,
    authUser: { id: string; email?: string }
  ): Promise<void> {
    if (!guestUserId || guestUserId === authUser.id) {
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
