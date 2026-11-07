/**
 * auth-flow.ts — Task 1.4: the pure decision logic behind the
 * post-onboarding email/password flows in AuthModal.
 *
 * Validation mirrors the onboarding screens exactly (CreateAccount
 * Screen / LoginScreen): a trimmed email containing '@', a full name
 * on signup, password ≥ 8 characters on signup, password present on
 * login. Errors are i18n keys — and auth failures themselves are
 * ALWAYS generic (F-10: never surface the provider error; it leaks
 * whether an account exists).
 *
 * The merge choice: signing in must not silently decide the fate of
 * two datasets. When the device holds guest history AND the account
 * already holds cloud data, the user chooses:
 *   - merge: the sync engine's guest-migration path folds device
 *     data into the account (nothing is deleted);
 *   - keep account data: the device data is archived via the
 *     Start-fresh archive (restorable in Settings → Data & Account)
 *     and the account's cloud state is pulled down.
 * In every other combination the plain sync is unambiguous and no
 * choice is shown.
 */
import type { StringKey } from './i18n/en';

export type AuthFormMode = 'login' | 'signup';

export interface AuthFormValues {
  name: string;
  email: string;
  password: string;
}

export type AuthFormField = 'name' | 'email' | 'password';

/**
 * Per-field validation — the SAME rules as validateAuthForm, scoped
 * to one field (QA-hardening R16: the onboarding screens validate
 * inline on blur/submit with these, instead of native browser
 * bubbles). Returns the field's i18n error key, or null.
 */
export function validateAuthField(
  mode: AuthFormMode,
  field: AuthFormField,
  values: AuthFormValues,
): StringKey | null {
  if (field === 'name') {
    return mode === 'signup' && !values.name.trim()
      ? 'auth.nameRequired'
      : null;
  }
  if (field === 'email') {
    const email = values.email.trim();
    return !email || !email.includes('@') ? 'auth.validEmail' : null;
  }
  // field === 'password'
  if (mode === 'signup') {
    return values.password.length < 8 ? 'auth.passwordLength' : null;
  }
  return !values.password ? 'auth.passwordRequired' : null;
}

/** Returns the i18n key of the first validation error, or null. */
export function validateAuthForm(
  mode: AuthFormMode,
  values: AuthFormValues,
): StringKey | null {
  return (
    validateAuthField(mode, 'name', values) ??
    validateAuthField(mode, 'email', values) ??
    validateAuthField(mode, 'password', values)
  );
}

/**
 * The merge choice is offered ONLY when both sides hold data worth
 * deciding over. One-sided cases sync directly (guest data links to
 * an empty account; an empty device pulls the account's data).
 */
export function shouldOfferMergeChoice(
  localHasData: boolean,
  cloudHasData: boolean,
): boolean {
  return localHasData && cloudHasData;
}
