/**
 * Task 1.2 (2026-11-05): privacy copy must be truthful and computed.
 *
 *  - getDataLocationStatus() is the single source for the Data Vault
 *    strip, the Welcome guest note, and the Settings FAQ privacy
 *    answer — replacing three hardcoded claims, one of which ("Your
 *    data stays 100% on your device") was false for signed-in users.
 *  - First-use AI notices are per-feature, stored locally, and never
 *    block the feature.
 *  - The /privacy page was aligned with verified behavior; the
 *    mismatches found are pinned here so they cannot regress:
 *      1. It said cloud sync was "Google OAuth" only — email &
 *         password sign-in exists and syncs identically.
 *      2. It listed Microsoft Clarity as a live diagnostics service —
 *         Clarity is not configured in the shipped app.
 *      3. It claimed a report flag sits next to ALL AI outputs —
 *         coach chat has none; the claim is now scoped to the
 *         surfaces that actually render one.
 *      4. It never mentioned Form Coach — now disclosed as
 *         device-only (verified: zero network calls in
 *         src/features/form-coach; video via object URL only).
 *      5. Guest Mode "ever touch any remote server" absolutism —
 *         qualified to sync, with explicit-invoke features pointed
 *         to their sections.
 *      6. Progress photos "never leave the device" — now also
 *         discloses the one exception: a backup file the user
 *         exports themselves (verified: photos are never in any
 *         sync payload).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  dataLocationMessageKey,
  getDataLocationStatus,
  isPermanentAccount,
} from '../src/lib/data-location';
import {
  aiNoticeMessageKey,
  hasSeenAiNotice,
  markAiNoticeSeen,
} from '../src/lib/ai-notices';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('getDataLocationStatus', () => {
  it('guest / signed-out / anonymous → device-only', () => {
    expect(getDataLocationStatus(false)).toBe('device-only');
    expect(isPermanentAccount(null)).toBe(false);
    expect(isPermanentAccount(undefined)).toBe(false);
    expect(isPermanentAccount({ isAnonymous: true })).toBe(false);
    expect(getDataLocationStatus(isPermanentAccount({ isAnonymous: true }))).toBe('device-only');
  });

  it('permanent account → device-and-cloud', () => {
    expect(isPermanentAccount({ isAnonymous: false })).toBe(true);
    expect(isPermanentAccount({})).toBe(true);
    expect(getDataLocationStatus(true)).toBe('device-and-cloud');
  });

  it('message keys resolve in both dictionaries and say the true thing', () => {
    const onlyKey = dataLocationMessageKey('device-only');
    const cloudKey = dataLocationMessageKey('device-and-cloud');
    expect(en[onlyKey]).toContain('this device only');
    expect(en[cloudKey]).toContain('syncs to your private cloud account');
    expect(hi[onlyKey]).toBeTruthy();
    expect(hi[cloudKey]).toBeTruthy();
    expect(hi[onlyKey]).not.toBe(en[onlyKey]);
  });
});

describe('privacy surfaces are driven by the computed status', () => {
  it('Data Vault strip renders the status line, not the old 100% claim', () => {
    const src = read('src/components/DataVaultModal.tsx');
    expect(src).toContain('dataLocationMessageKey(');
    expect(src).toContain('getDataLocationStatus(isPermanentAccount(syncUser))');
    expect(src).not.toContain('vault.privacyGuarantee');
  });

  it('Welcome guest note renders the device-only status line', () => {
    const src = read('src/components/onboarding/WelcomeScreen.tsx');
    expect(src).toContain('dataLocationMessageKey(getDataLocationStatus(false))');
    expect(src).not.toContain('onboarding.guestNote');
  });

  it('Settings FAQ privacy answer is computed from the live user', () => {
    const src = read('src/components/SettingsView.tsx');
    expect(src).toContain("item.q === 'settings.faqQ5'");
    expect(src).toContain('getDataLocationStatus(isPermanentAccount(user))');
    // The static faqA5 remains only as a status-neutral fallback in
    // the FAQ table; the rendered answer is the computed line, so the
    // render must not fall through to t(item.a) for this item.
    expect(src).toContain("? t(dataLocationMessageKey(getDataLocationStatus(isPermanentAccount(user))))");
  });

  it('the two false hardcoded claim keys are gone from both dictionaries', () => {
    for (const key of ['vault.privacyGuarantee', 'onboarding.guestNote'] as const) {
      expect((en as Record<string, string>)[key], `en ${key}`).toBeUndefined();
      expect((hi as Record<string, string>)[key], `hi ${key}`).toBeUndefined();
    }
    // faqA5 was rewritten, not removed: it is now true in both states.
    expect(en['settings.faqA5']).toContain('private cloud account');
    expect(hi['settings.faqA5']).toBeTruthy();
  });
});

describe('AI first-use notices', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      length: 0,
      key: () => null,
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('unseen by default; seen after marking; per-feature independent', () => {
    expect(hasSeenAiNotice('meal-scan')).toBe(false);
    expect(hasSeenAiNotice('coach-chat')).toBe(false);
    markAiNoticeSeen('meal-scan');
    expect(hasSeenAiNotice('meal-scan')).toBe(true);
    expect(hasSeenAiNotice('coach-chat')).toBe(false);
    markAiNoticeSeen('coach-chat');
    expect(hasSeenAiNotice('coach-chat')).toBe(true);
  });

  it('corrupt storage reads as unseen (banner shows; nothing breaks)', () => {
    store.set('ascend_ai_notices_seen_v1', '{not json');
    expect(hasSeenAiNotice('meal-scan')).toBe(false);
  });

  it('notice copy exists in both dictionaries and names the data flow', () => {
    expect(en[aiNoticeMessageKey('meal-scan')]).toContain('Groq and Google Gemini');
    expect(en[aiNoticeMessageKey('meal-scan')]).toContain('never sent to free-tier models');
    expect(en[aiNoticeMessageKey('coach-chat')]).toContain('free-tier text models may keep submitted text');
    expect(hi[aiNoticeMessageKey('meal-scan')]).toBeTruthy();
    expect(hi[aiNoticeMessageKey('coach-chat')]).toBeTruthy();
    expect(en['aiNotice.dismiss']).toBeTruthy();
    expect(hi['aiNotice.dismiss']).toBeTruthy();
  });

  it('both AI surfaces mount the banner for their feature', () => {
    expect(read('src/components/ScanMealModal.tsx')).toContain('<AiNoticeBanner feature="meal-scan" />');
    expect(read('src/components/CoachChatSection.tsx')).toContain('<AiNoticeBanner feature="coach-chat" />');
  });
});

describe('/privacy page alignment', () => {
  const page = read('src/app/privacy/page.tsx');

  it('sign-in methods include email & password (not Google-only)', () => {
    expect(page).toContain('Google or Email &amp; Password via Supabase');
    expect(page).not.toContain('Google OAuth &amp; Supabase');
    expect(page).not.toContain('sign in with Google OAuth');
  });

  it('Form Coach is disclosed as device-only', () => {
    expect(page).toContain('Form Coach Video (Device-Only)');
    expect(page).toContain('never uploaded or transmitted anywhere');
  });

  it('progress photos disclose the self-export exception', () => {
    expect(page).toContain('backup file you choose to export yourself');
  });

  it('Clarity is not claimed as a live diagnostics service', () => {
    expect(page).not.toContain('Microsoft Clarity');
  });

  it('the report-flag claim is scoped to surfaces that render one', () => {
    expect(page).not.toContain('next to all AI outputs');
    expect(page).toContain('meal scanning, barcode results, voice logging, and post-workout summaries');
  });

  it('guest-mode absolutism is qualified to sync', () => {
    expect(page).not.toContain('ever touch any remote server');
    expect(page).toContain('no workout records, PRs, or nutritional entries are synced to any remote server');
  });
});
