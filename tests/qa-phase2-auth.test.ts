// QA-hardening Phase 2, R16 — auth screens.
// (a) Create Account now carries the same ASCEND logo mark as Login
//     (audit Phase 5 gave it to Login only).
// (b) Both screens validate INLINE (blur + submit) with plain
//     per-field messages instead of native browser bubbles: forms
//     are noValidate, the `required` attributes are gone, and errors
//     render under their field with role="alert" + aria wiring.
//     The per-field rules live in validateAuthField (auth-flow.ts)
//     and are exactly validateAuthForm's rules scoped per field —
//     auth logic itself is unchanged. The signup password message is
//     now the existing i18n key (it was a hardcoded English string).
// (c) AuthModal + ForgotPasswordModal forms also got noValidate so
//     no auth surface can show a native bubble.
// Browser evidence: qa/e2e/r16-auth.spec.ts (fresh-guest drive,
// inline errors on submit + blur, screenshots 360x740 light + dark
// for both screens).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateAuthField,
  validateAuthForm,
  type AuthFormValues,
} from '../src/lib/auth-flow';

const read = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const create = read('src/components/onboarding/CreateAccountScreen.tsx');
const login = read('src/components/onboarding/LoginScreen.tsx');

describe('R16 validateAuthField mirrors validateAuthForm per field', () => {
  const cases: AuthFormValues[] = [
    { name: 'Alex', email: 'alex@example.com', password: 'password1' },
    { name: '  ', email: 'alex@example.com', password: 'password1' },
    { name: 'Alex', email: 'alex', password: 'password1' },
    { name: 'Alex', email: '', password: 'password1' },
    { name: 'Alex', email: 'alex@example.com', password: 'short' },
    { name: 'Alex', email: 'alex@example.com', password: '' },
  ];

  it('field rules return the documented keys', () => {
    const good = cases[0];
    expect(validateAuthField('signup', 'name', { ...good, name: ' ' })).toBe('auth.nameRequired');
    expect(validateAuthField('login', 'name', { ...good, name: '' })).toBeNull();
    expect(validateAuthField('signup', 'email', { ...good, email: 'alex' })).toBe('auth.validEmail');
    expect(validateAuthField('signup', 'password', { ...good, password: 'short' })).toBe('auth.passwordLength');
    expect(validateAuthField('login', 'password', { ...good, password: '' })).toBe('auth.passwordRequired');
    expect(validateAuthField('login', 'password', { ...good, password: 'x' })).toBeNull();
    expect(validateAuthField('signup', 'email', good)).toBeNull();
  });

  it('validateAuthForm is the first field error in name→email→password order', () => {
    for (const mode of ['login', 'signup'] as const) {
      for (const values of cases) {
        const expected =
          validateAuthField(mode, 'name', values) ??
          validateAuthField(mode, 'email', values) ??
          validateAuthField(mode, 'password', values);
        expect(validateAuthForm(mode, values)).toBe(expected);
      }
    }
  });
});

describe('R16 auth screens: logo + inline validation, no native bubbles', () => {
  it('Create Account carries the same logo mark as Login', () => {
    const logo = '<img\n          src="/ascend-logo.png"';
    expect(create).toContain('src="/ascend-logo.png"');
    expect(create).toContain('alt="ASCEND"');
    expect(create).toContain('className="w-16 h-16 mx-auto mb-5 rounded-2xl shadow-sm"');
    expect(login).toContain('src="/ascend-logo.png"');
    void logo;
  });

  it('both forms are noValidate and no input uses required', () => {
    expect(create).toContain('<form onSubmit={handleSubmit} noValidate');
    expect(login).toContain('<form onSubmit={handleSubmit} noValidate');
    expect(create).not.toContain('required');
    expect(login).not.toContain('required');
  });

  it('both screens validate per field on blur and announce errors accessibly', () => {
    for (const src of [create, login]) {
      expect(src).toContain('validateAuthField');
      expect(src).toContain('onBlur={() => checkField(');
      expect(src).toContain('role="alert"');
      expect(src).toContain('aria-invalid={fieldErrors.');
      expect(src).toContain('aria-describedby={fieldErrors.');
    }
  });

  it('the signup password error is the i18n key, not a hardcoded string', () => {
    expect(create).not.toContain('Use a mix of letters and numbers');
    expect(create).not.toContain('Password must be at least 8 characters long.');
  });

  it('AuthModal and ForgotPasswordModal forms are noValidate too', () => {
    expect(read('src/components/AuthModal.tsx')).toContain('noValidate');
    expect(read('src/components/onboarding/ForgotPasswordModal.tsx')).toContain(
      '<form onSubmit={handleSubmit} noValidate',
    );
  });
});
