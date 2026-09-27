# ASCEND Authenticated-First Architecture & Entry Flow

## 1. Executive Summary

ASCEND has transitioned from a guest-first prototype to a production-grade, **authenticated-first** mobile architecture. Unauthenticated users cannot enter protected app routes, and new installations never generate an automatic guest account (`DEFAULT_USER_ID`). Existing legacy installations that operated locally are seamlessly migrated to authenticated Supabase accounts upon their first sign-in without data loss.

---

## 2. Authentication State Machine & Routing Lifecycle

```
                                  +-------------------+
                                  |    App Launch     |
                                  +---------+---------+
                                            |
                                            v
                              +---------------------------+
                              |   initializeDatabase()    |
                              |     initializeAuth()      |
                              +-------------+-------------+
                                            |
                      +---------------------+---------------------+
                      |                                           |
                      v                                           v
            [ Session Found ]                           [ No Valid Session ]
                      |                                           |
                      v                                           v
       +-------------------------------+                 +-----------------+
       | Profile Incomplete (onboard=0)|                 |  /auth Screen   |
       +--------------+----------------+                 +--------+--------+
                      |                                           |
          +-----------+-----------+                               |
          |                       |                   +-----------+-----------+
          v                       v                   |                       |
   [ Redirect to ]         [ Profile Complete ]       v                       v
    /onboarding                   |             [ Google OAuth ]      [ Email Auth ]
          |                       v             (ascend://callback)   (Login / Signup)
          v                  [ Enter App ]            |                       |
   [ Complete Flow ]           /(tabs)                +-----------+-----------+
          |                                                       |
          +-------------------------------------------------------+
                                  |
                                  v
                       [ Authenticated State ]
```

### Routing Rules (Enforced in `src/app/_layout.tsx`)
1. **Unauthenticated (`isAuthenticated === false`)**:
   - Strictly restricted to `/auth` and `/auth/callback`.
   - Any attempt to access protected tabs (`/(tabs)`), modals (`/modals`), or onboarding (`/onboarding`) is redirected immediately to `/auth`.
2. **Authenticated with Incomplete Onboarding (`profile.onboardingCompleted === false`)**:
   - Directed to `/onboarding`.
   - Prevented from entering main tabs (`/(tabs)`).
3. **Authenticated with Complete Onboarding (`profile.onboardingCompleted === true`)**:
   - Directed to the tactical dashboard at `/(tabs)`.
   - If visiting `/auth` or `/onboarding`, redirected to `/(tabs)`.

---

## 3. Google OAuth Architecture & Deep Linking

### Security Invariants
- **Zero Client Secrets**: Google OAuth credentials and client secrets are configured exclusively within the Supabase Cloud dashboard. No Google client secret exists anywhere in the client codebase or `.env` files.
- **Expo Scheme**: Registered in `app.json` as `ascend`.
- **Redirect URI**: `ascend://auth/callback`.

### Deep Link Mechanics
1. **Trigger**:
   - Calling `AuthService.signInWithGoogle()` calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'ascend://auth/callback', skipBrowserRedirect: true } })`.
   - The user is redirected to the Google authentication consent page in the external system browser via `Linking.openURL()`.
2. **Return & Handshake**:
   - Upon successful sign-in, Google redirects back through Supabase to `ascend://auth/callback`.
   - ASCEND intercepts this deep link via two mechanisms:
     - Active screen listener: `Linking.addEventListener('url', handleUrlChange)` in `src/app/auth/index.tsx`.
     - Route handler: `src/app/auth/callback.tsx` (handles cold-boot deep links).
3. **Session Establishment**:
   - `AuthService.handleAuthCallback(url)` parses either:
     - **PKCE Flow**: Extracts query parameter `?code=...` and calls `supabase.auth.exchangeCodeForSession(code)`.
     - **Implicit Grant**: Extracts hash fragment `#access_token=...&refresh_token=...` and calls `supabase.auth.setSession(...)`.
     - **OAuth Error/Cancellation**: Extracts `?error=...` or `?error_description=...` and translates it into user-friendly feedback without crashing.
   - On completion, `useAuthStore.setSessionUser(userId, email)` binds the authenticated user to the app runtime.

---

## 4. Email & Password Authentication

### Client-Side Validation
Implemented in `AuthService.validateEmail` and `AuthService.validatePassword`:
- **Email Validation**: Validated with `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- **Password Strength**: Requires a minimum of 6 characters.
- **Password Confirmation**: Sign-up enforces identical entries for `password` and `confirmPassword`.

### User-Friendly Error Translation (`AuthService.translateAuthError`)
Raw Supabase, GoTrue, or network errors are mapped into tactical, clear messages:

| Raw Error Substring | Translated User Feedback |
| :--- | :--- |
| `invalid login credentials`, `invalid_credentials`, `wrong password` | "Incorrect email or password. Please verify your credentials." |
| `user already registered`, `already exists`, `email address is already in use` | "An account with this email already exists. Please log in instead." |
| `invalid email`, `valid email` | "Please enter a valid email address (e.g., operative@domain.com)." |
| `short`, `at least`, `characters` | "Password must be at least 6 characters long." |
| `passwords do not match` | "Passwords do not match. Please verify both entries." |
| `network`, `failed to fetch`, `timeout`, `connection` | "Network connection failure. Please check your internet connection and try again." |
| `cancel`, `access_denied`, `user cancelled` | "Google sign-in was cancelled." |
| `expired`, `token has expired`, `session expired` | "Your authentication session has expired. Please log in again." |

---

## 5. Session Persistence & Restoration

- **Secure Storage**: Configured via `ExpoSecureStoreAdapter` (`src/lib/supabase.ts`) using `expo-secure-store`.
- **Auto Refresh**: `autoRefreshToken: true` ensures JWTs are silently refreshed before expiration.
- **App Launch Boot Sequence** (`src/app/_layout.tsx`):
  1. `initializeDatabase()`: Ensures all SQLite schema migrations are applied.
  2. `initializeAuth()`:
     - Calls `supabase.auth.getSession()`.
     - If a valid session exists, queries the user profile from SQLite.
     - If no profile exists locally, inserts an empty uncompleted profile record.
     - Sets `isAuthenticated: true` and `isLoading: false`.
  3. `loadSettings(activeUserId)`: Hydrates user units, sound, and theme preferences.
  4. Background synchronization (`SyncEngine.init()`) is started.

---

## 6. Legacy Guest Data Migration

For users upgrading from older ASCEND versions that operated under the guest user ID `u-default-local`:

1. When an existing guest signs in or signs up, `useAuthStore.setSessionUser` or `useAuthStore.initializeAuth` checks for the presence of a local profile under `DEFAULT_USER_ID` (`u-default-local`).
2. If detected and the new authenticated Supabase UUID differs:
   - `ProfileRepository.migrateGuestUser(DEFAULT_USER_ID, authUserId, email)` is invoked.
   - All associated relational records are transactionally re-keyed to the new Supabase UUID:
     - `profiles` (`id = authUserId`, `auth_id = authUserId`, `is_guest = 0`)
     - `workout_sessions` (`user_id = authUserId`)
     - `exercise_logs` (`user_id = authUserId`)
     - `set_logs` (`user_id = authUserId`)
     - `exercise_mastery` (`user_id = authUserId`)
     - `personal_records` (`user_id = authUserId`)
     - `xp_transactions` (`user_id = authUserId`)
     - `user_settings` (`user_id = authUserId`)
     - `user_privacy_settings` (`user_id = authUserId`)
     - `local_sync_queue` (`user_id = authUserId`)
3. Zero data is lost, zero duplicate accounts are created, and `is_guest` is permanently set to `0`.

---

## 7. Verification & Automated Testing

The authentication suite is verified via:
- **Unit & Integration Tests**: `src/services/auth/__tests__/AuthService.test.ts` (29 comprehensive unit tests).
- **Full Test Suite**: `npm test` (47 test files, 383 tests passing).
- **TypeScript Strict Analysis**: `npx tsc --noEmit` (0 errors).
