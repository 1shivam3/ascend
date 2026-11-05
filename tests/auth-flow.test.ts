/**
 * Task 1.4 (2026-11-05): guests can create / log in to email-password
 * accounts AFTER onboarding, via AuthModal.
 *
 * Before: email/password existed only as onboarding screens
 * (LoginScreen / CreateAccountScreen). A guest who skipped them had
 * no way to create or use an email account later — AuthModal offered
 * Google only, even though the sync engine already had full
 * signUpWithPassword / signInWithPassword / resetPasswordForEmail.
 *
 * Covered here:
 *  - validateAuthForm mirrors the onboarding validation exactly
 *    (name on signup, '@' email, ≥8-char password on signup,
 *    password present on login).
 *  - shouldOfferMergeChoice: the choice appears ONLY when the
 *    device holds guest history AND the account holds cloud data.
 *  - Wiring: login defers the sync (the merge must be decidable
 *    before it runs); the keep-account path archives via
 *    startFreshFromRetainedHistory BEFORE syncing, and refuses to
 *    sync when the archive write fails; signup never archives
 *    (new account → local data links, per the brief).
 *  - All new copy exists in en + hi; failures are generic (F-10 —
 *    the modal never renders a raw provider error).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { shouldOfferMergeChoice, validateAuthForm } from '../src/lib/auth-flow';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('validateAuthForm (mirrors the onboarding screens)', () => {
  const good = { name: 'Alex', email: 'alex@example.com', password: 'password8' };

  it('accepts valid signup and login forms', () => {
    expect(validateAuthForm('signup', good)).toBeNull();
    expect(validateAuthForm('login', { ...good, name: '' })).toBeNull();
  });

  it('signup requires a name; login does not ask for one', () => {
    expect(validateAuthForm('signup', { ...good, name: '  ' })).toBe('auth.nameRequired');
    expect(validateAuthForm('login', { ...good, name: '' })).toBeNull();
  });

  it('email must contain @', () => {
    expect(validateAuthForm('login', { ...good, email: 'alex' })).toBe('auth.validEmail');
    expect(validateAuthForm('signup', { ...good, email: '' })).toBe('auth.validEmail');
  });

  it('signup enforces the 8-character minimum; login only requires presence', () => {
    expect(validateAuthForm('signup', { ...good, password: 'short7!' })).toBe('auth.passwordLength');
    expect(validateAuthForm('signup', { ...good, password: 'eight888' })).toBeNull();
    expect(validateAuthForm('login', { ...good, password: '' })).toBe('auth.passwordRequired');
    expect(validateAuthForm('login', { ...good, password: 'x' })).toBeNull();
  });
});

describe('shouldOfferMergeChoice', () => {
  it('only when BOTH sides hold data', () => {
    expect(shouldOfferMergeChoice(true, true)).toBe(true);
    expect(shouldOfferMergeChoice(true, false)).toBe(false);
    expect(shouldOfferMergeChoice(false, true)).toBe(false);
    expect(shouldOfferMergeChoice(false, false)).toBe(false);
  });
});

describe('AuthModal wiring (Task 1.4)', () => {
  const modal = read('src/components/AuthModal.tsx');

  it('login defers the sync so the merge stays decidable', () => {
    expect(modal).toContain('signInWithPassword(email.trim(), password, { deferSync: true })');
    const engine = read('src/lib/supabase/sync.ts');
    expect(engine).toContain('opts?: { deferSync?: boolean }');
    expect(engine).toContain('if (!opts?.deferSync)');
    expect(engine).toContain('accountHasCloudData');
  });

  it('the choice offers the two brief-specified actions', () => {
    expect(modal).toContain("t('auth.mergeDeviceBtn')");
    expect(modal).toContain("t('auth.keepAccountBtn')");
    expect(en['auth.mergeDeviceBtn']).toBe("Merge this device's data into your account");
    expect(en['auth.keepAccountBtn']).toBe("Keep account data and archive this device's data");
  });

  it('keep-account archives BEFORE syncing, and a failed archive blocks the sync', () => {
    const keepBlock = modal.slice(modal.indexOf("choice === 'keep'"));
    expect(keepBlock.indexOf('startFreshFromRetainedHistory()')).toBeGreaterThan(-1);
    expect(keepBlock.indexOf('startFreshFromRetainedHistory()')).toBeLessThan(keepBlock.indexOf('await syncNow()'));
    expect(keepBlock).toContain('if (!archived)');
  });

  it('signup links local data — it never archives and never defers', () => {
    const signupBlock = modal.slice(modal.indexOf("mode === 'signup'"), modal.indexOf("mode === 'signup'") + 900);
    expect(signupBlock).toContain('signUpWithPassword(email.trim(), password, name.trim())');
    expect(signupBlock).not.toContain('startFreshFromRetainedHistory');
    expect(modal).not.toContain('deferSync: false');
  });

  it('forgot password reuses the onboarding modal; failures are generic', () => {
    expect(modal).toContain("from '@/components/onboarding/ForgotPasswordModal'");
    expect(modal).toContain('<ForgotPasswordModal');
    expect(modal).toContain("t('auth.signInFailed')");
    expect(modal).toContain("t('auth.createFailed')");
    // No raw provider error is ever rendered into the form.
    expect(modal).not.toContain('res.error) setFormError(res.error');
    expect(modal).not.toContain('setFormError(res.error)');
  });

  it('password field has show/hide and the 8-char hint on signup', () => {
    expect(modal).toContain("auth.hidePassword");
    expect(modal).toContain("auth.showPassword");
    expect(modal).toContain("t('auth.passwordLength')");
  });
});

describe('Task 1.4 copy (en + hi)', () => {
  it('all new keys exist in both dictionaries', () => {
    for (const key of [
      'auth.linkAccount',
      'auth.emailPlaceholder',
      'auth.mergeTitle',
      'auth.mergeBody',
      'auth.mergeDeviceBtn',
      'auth.keepAccountBtn',
      'auth.mergeDone',
      'auth.archiveDone',
    ] as const) {
      expect(en[key], `en ${key}`).toBeTruthy();
      expect(hi[key], `hi ${key}`).toBeTruthy();
    }
  });

  it('the signed-in panel no longer claims every account is Google', () => {
    expect(en['auth.connected']).toBe('Account Connected');
    expect(hi['auth.connected']).not.toContain('Google');
  });
});
