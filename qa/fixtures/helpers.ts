import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { STORE_KEY } from './personas';

/**
 * Shared QA helpers (Phase 0): screenshot convention, persisted-state
 * preference setters, network control, and a mocked clock.
 *
 * The preference setters patch the app's own persisted blob
 * (localStorage `ascend_store`) and reload — they exercise the real
 * rehydration path instead of depending on Settings navigation, which
 * keeps later-phase specs short. UI-driven changes remain possible in
 * the specs themselves whenever the journey is the thing under test.
 */

export const SCREENSHOT_ROOT = path.resolve(process.cwd(), 'qa/screenshots');

/** Screenshot convention: qa/screenshots/<persona>/<step>.png */
export async function shot(page: Page, persona: string, step: string): Promise<string> {
  const dir = path.join(SCREENSHOT_ROOT, persona);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${step}.png`);
  await page.screenshot({ path: file });
  return file;
}

interface StoreBlob {
  state: Record<string, unknown>;
  version: number;
}

async function readStore(page: Page): Promise<StoreBlob> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) throw new Error(`localStorage ${key} is empty — seed or onboard first`);
    return JSON.parse(raw);
  }, STORE_KEY);
}

async function writeStore(page: Page, blob: StoreBlob): Promise<void> {
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [STORE_KEY, JSON.stringify(blob)] as const,
  );
}

/** Patches top-level persisted state keys, then reloads the app. */
export async function patchStore(
  page: Page,
  patch: Record<string, unknown>,
  reload = true,
): Promise<void> {
  const blob = await readStore(page);
  Object.assign(blob.state, patch);
  await writeStore(page, blob);
  if (reload) await page.reload({ waitUntil: 'load' });
}

/** Patches uiPreferences keys (merged), then reloads the app. */
export async function patchUiPreferences(
  page: Page,
  patch: Record<string, unknown>,
  reload = true,
): Promise<void> {
  const blob = await readStore(page);
  const current = (blob.state.uiPreferences ?? {}) as Record<string, unknown>;
  blob.state.uiPreferences = { ...current, ...patch };
  await writeStore(page, blob);
  if (reload) await page.reload({ waitUntil: 'load' });
}

export type AccentId = 'vermilion' | 'cobalt' | 'forest' | 'plum' | 'teal' | 'rose' | 'custom';

export async function setAccent(page: Page, accent: AccentId, customHex?: string): Promise<void> {
  await patchUiPreferences(page, {
    accentTheme: accent,
    customAccentHex: accent === 'custom' ? (customHex ?? null) : null,
  });
}

/**
 * Sets the app theme the way the app itself does (Phase 3 fix).
 *
 * The Phase 0 version of this helper only patched `theme` inside the
 * persisted store blob. That never worked: public/theme-init.js
 * honors a stored theme only when it is a CUSTOM choice, and the
 * custom flag lives in the standalone localStorage keys
 * `ascend_theme` + `ascend_has_custom_theme` (exactly the writes
 * store.setTheme makes in src/lib/store.ts). Without them the app
 * follows the OS preference — light in this harness — so every
 * "dark" screenshot taken through the old helper was actually a
 * light render (root-caused in Phase 2; the Phase 2 specs carried a
 * local workaround).
 *
 * This version mirrors store.setTheme's writes through an init
 * script — the channel that survives the app's persist-on-unload
 * during reload — keeps the blob consistent for rehydration, then
 * reloads and ASSERTS the html `data-theme` attribute matches, so a
 * screenshot taken after setTheme(page, 'dark') is provably dark.
 */
export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem('ascend_theme', t);
      window.localStorage.setItem('ascend_has_custom_theme', 'true');
      const raw = window.localStorage.getItem('ascend_store');
      if (raw) {
        const blob = JSON.parse(raw);
        if (blob && blob.state) {
          blob.state.theme = t;
          blob.state.hasCustomTheme = true;
          window.localStorage.setItem('ascend_store', JSON.stringify(blob));
        }
      }
    } catch {}
  }, theme);
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // Settle: `load` fires before React finishes mounting (lazy tab
  // chunks + the mount fade), and a screenshot taken inside that
  // window captures the skeleton or a mid-fade frame — the Phase 3
  // re-shoots caught exactly that (a uniformly dim "dark" frame that
  // resolved to a crisp render ~1 s later). Wait for the network to
  // go idle, then a beat for the fade, mirroring the settle waits
  // the specs already use after opening a workout.
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

export async function setTextSize(page: Page, textScale: 'normal' | 'large' | 'xlarge'): Promise<void> {
  await patchUiPreferences(page, { textScale });
}

export async function setLanguage(page: Page, language: 'en' | 'hi'): Promise<void> {
  await patchUiPreferences(page, { language });
}

export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
}

export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
}

export interface ThrottleProfile {
  /** kbps */
  downloadKbps: number;
  /** kbps */
  uploadKbps: number;
  latencyMs: number;
}

export const THROTTLE_PRESETS: Record<'slow3g' | 'fast3g' | 'slow4g', ThrottleProfile> = {
  slow3g: { downloadKbps: 400, uploadKbps: 400, latencyMs: 400 },
  fast3g: { downloadKbps: 1600, uploadKbps: 750, latencyMs: 150 },
  slow4g: { downloadKbps: 1600, uploadKbps: 750, latencyMs: 150 },
};

/** Throttles the page's network via CDP. Call clearThrottle to undo. */
export async function throttleNetwork(page: Page, profile: ThrottleProfile): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile.latencyMs,
    downloadThroughput: (profile.downloadKbps * 1024) / 8,
    uploadThroughput: (profile.uploadKbps * 1024) / 8,
  });
}

export async function clearThrottle(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}

/**
 * Installs Playwright's mocked clock at a fixed instant. Call BEFORE
 * page.goto() — the clock only exists from installation onward.
 * Returns the page clock for advancing time inside a spec.
 */
export async function mockClock(page: Page, isoTime: string) {
  await page.clock.install({ time: new Date(isoTime) });
  return page.clock;
}
