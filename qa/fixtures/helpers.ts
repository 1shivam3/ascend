import type { Page } from '@playwright/test';
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

export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await patchStore(page, { theme });
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
