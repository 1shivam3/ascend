/**
 * Task 1.3 (2026-11-05): the Settings sign-in methods copy claimed
 * four methods — "Google, Apple, email & password, email link" —
 * but only Google and email & password have any UI surface in the
 * app (verified: AuthModal offered Google only; the sync engine's
 * password methods exist and are wired by Task 1.4; there is no
 * Apple button and no email-link flow anywhere). Copy now matches
 * the shipped methods exactly, and the App Store Guideline 4.8
 * obligation is recorded as a code comment on the card so a future
 * iOS build cannot silently inherit the gap.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('sign-in methods copy (Task 1.3)', () => {
  it('English copy offers exactly Google + email & password + guest', () => {
    const copy = en['settings.supportedMethods'];
    expect(copy).toContain('Google');
    expect(copy).toContain('email & password');
    expect(copy).not.toContain('Apple');
    expect(copy.toLowerCase()).not.toContain('email link');
  });

  it('Hindi copy matches (no Apple, no email link)', () => {
    const copy = hi['settings.supportedMethods'];
    expect(copy).toContain('गूगल');
    expect(copy).toContain('ईमेल और पासवर्ड');
    expect(copy).not.toContain('ऐपल');
    expect(copy).not.toContain('ईमेल लिंक');
  });

  it('the card still renders from the key and carries the 4.8 comment', () => {
    const src = read('src/components/SettingsView.tsx');
    expect(src).toContain("t('settings.supportedMethods')");
    expect(src).toContain('App Store Review Guideline 4.8');
    expect(src).toContain('Sign in with Apple');
  });

  it('no other user-facing copy offers Apple or email-link sign-in', () => {
    // methodApple survives ONLY as the factual label for an existing
    // session's provider in the signed-in state — it is not an offer.
    const auth = read('src/components/AuthModal.tsx');
    expect(auth).not.toContain('Apple');
    expect(auth.toLowerCase()).not.toContain('email link');
  });
});
