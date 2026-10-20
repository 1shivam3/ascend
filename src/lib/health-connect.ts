/**
 * Health Connect sync (Android, native only).
 *
 * Reads steps, sleep and weight from Health Connect via
 * @capgo/capacitor-health (v8, Capacitor 8 peer, actively maintained;
 * the older ubie-oss capacitor-health-connect targets Capacitor 5 and
 * was rejected for that reason). The plugin manifest declares read+
 * write for every health data type; the app manifest strips all but
 * READ_STEPS / READ_SLEEP / READ_WEIGHT, so ASCEND never even holds
 * permissions for data it does not use.
 *
 * Consent-first: nothing is read until the user turns the Settings
 * toggle on, which triggers the Health Connect permission sheet.
 * Sync runs on app foreground only — no background service.
 *
 * The pure functions in this file (merge rules, sleep/step summaries,
 * readiness signals) are unit-tested. The native read path itself can
 * only be verified on a real device with Health Connect data.
 */
import { Capacitor } from '@capacitor/core';
import { Health, type HealthSample } from '@capgo/capacitor-health';
import type { BodyMetricEntry } from './types';
import { getLocalTodayStr } from './formatters';

export const HEALTH_READ_TYPES = ['steps', 'sleep', 'weight'] as const;

/** What one day of Health Connect data looks like after summarizing. */
export interface HealthDaySummary {
  /** Local date (YYYY-MM-DD) this summary belongs to — "today". */
  date: string;
  /** Steps recorded today so far. */
  stepsToday: number;
  /** Steps recorded yesterday (full day) — readiness uses this. */
  stepsYesterday: number;
  /** Sleep that ended this morning, in minutes. Null when no data. */
  sleepMinutesLastNight: number | null;
}

/** The slice of a summary the readiness engine consumes. */
export interface HealthSignals {
  sleepMinutesLastNight?: number;
  stepsYesterday?: number;
}

export interface HealthWeightSample {
  date: string; // local YYYY-MM-DD
  weightKg: number;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function localDateOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return getLocalTodayStr(d);
}

export function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return getLocalTodayStr(dt);
}

/** Sum step samples into per-local-date totals. */
export function aggregateStepsByDate(
  samples: Array<{ startDate: string; value: number }>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of samples) {
    const date = localDateOf(s.startDate);
    if (!date || !(s.value > 0)) continue;
    out[date] = (out[date] || 0) + Math.round(s.value);
  }
  return out;
}

const MAX_SLEEP_MINUTES = 16 * 60;

/**
 * "Last night's sleep" for a wake date: sleep sessions that END on
 * that date before noon (a session ending at 23:40 belongs to the
 * night it started, not to last night). Durations come from the
 * session timestamps; awake-stage samples are excluded. Overlapping
 * sessions can double-count on multi-device setups — the total is
 * capped at 16h to keep it sane.
 */
export function summarizeSleepMinutes(
  samples: Array<{ startDate: string; endDate: string; value?: number; sleepState?: string }>,
  wakeDate: string
): number | null {
  let total = 0;
  let found = false;
  for (const s of samples) {
    if (s.sleepState === 'awake' || s.sleepState === 'inBed') continue;
    const end = new Date(s.endDate);
    if (Number.isNaN(end.getTime())) continue;
    if (localDateOf(s.endDate) !== wakeDate) continue;
    if (end.getHours() >= 12) continue;
    const start = new Date(s.startDate);
    let minutes = Number.isNaN(start.getTime())
      ? 0
      : (end.getTime() - start.getTime()) / 60000;
    if (!(minutes > 0) && typeof s.value === 'number' && s.value > 0 && s.value <= 1440) {
      minutes = s.value;
    }
    if (minutes > 0) {
      total += minutes;
      found = true;
    }
  }
  if (!found) return null;
  return Math.round(Math.min(total, MAX_SLEEP_MINUTES));
}

/** Latest weight sample per local date (samples may arrive unordered). */
export function latestWeightsByDate(
  samples: Array<{ startDate: string; value: number }>
): HealthWeightSample[] {
  const byDate = new Map<string, { weightKg: number; at: number }>();
  for (const s of samples) {
    const date = localDateOf(s.startDate);
    const at = new Date(s.startDate).getTime();
    if (!date || !(s.value > 0) || Number.isNaN(at)) continue;
    const prev = byDate.get(date);
    if (!prev || at >= prev.at) byDate.set(date, { weightKg: s.value, at });
  }
  return Array.from(byDate.entries())
    .map(([date, v]) => ({ date, weightKg: Math.round(v.weightKg * 10) / 10 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface WeightMergeResult {
  /** Entries to insert or replace (same id on replace). */
  upserts: BodyMetricEntry[];
  /** Dates skipped because a manual weigh-in already exists there. */
  skippedManualDates: string[];
}

/**
 * Merge rules for Health Connect weights:
 * - A manual weigh-in for a date is NEVER overwritten.
 * - An existing Health Connect entry for a date is updated in place
 *   (same id) when Health Connect reports a different latest value.
 * - A new date creates a new entry tagged source: 'health-connect',
 *   which the user can still edit or delete like any other entry.
 */
export function mergeHealthWeights(
  existing: BodyMetricEntry[],
  samples: HealthWeightSample[]
): WeightMergeResult {
  const byDate = new Map(existing.map((e) => [e.date, e]));
  const upserts: BodyMetricEntry[] = [];
  const skippedManualDates: string[] = [];
  for (const sample of samples) {
    if (!(sample.weightKg > 0)) continue;
    const weightKg = Math.round(sample.weightKg * 10) / 10;
    const current = byDate.get(sample.date);
    if (current && current.source !== 'health-connect') {
      skippedManualDates.push(sample.date);
      continue;
    }
    if (current) {
      if (current.weightKg !== weightKg) {
        upserts.push({ ...current, weightKg, source: 'health-connect' });
      }
      continue;
    }
    upserts.push({
      id: `hc-weight-${sample.date}`,
      date: sample.date,
      weightKg,
      source: 'health-connect',
    });
  }
  return { upserts, skippedManualDates };
}

/**
 * Readiness consumes sleep + yesterday's steps as OPTIONAL signals.
 * Steps of 0 are excluded: Health Connect cannot distinguish "phone
 * left on the desk all day" from a truly sedentary day, and readiness
 * must never penalize a user for missing data.
 */
export function buildHealthSignals(
  summary: HealthDaySummary | null | undefined
): HealthSignals | undefined {
  if (!summary) return undefined;
  const signals: HealthSignals = {};
  if (
    typeof summary.sleepMinutesLastNight === 'number' &&
    summary.sleepMinutesLastNight >= 60
  ) {
    signals.sleepMinutesLastNight = summary.sleepMinutesLastNight;
  }
  if (summary.stepsYesterday > 0) {
    signals.stepsYesterday = summary.stepsYesterday;
  }
  return Object.keys(signals).length > 0 ? signals : undefined;
}

// ── Native bridge (all no-ops off native) ────────────────────────────────────

export function isHealthConnectSupported(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function isHealthConnectAvailable(): Promise<boolean> {
  if (!isHealthConnectSupported()) return false;
  try {
    const res = await Health.isAvailable();
    return !!res.available;
  } catch {
    return false;
  }
}

export type HealthAuthorizationState = 'granted' | 'denied' | 'unknown';

export async function checkHealthAuthorization(): Promise<HealthAuthorizationState> {
  if (!isHealthConnectSupported()) return 'unknown';
  try {
    const status = await Health.checkAuthorization({ read: [...HEALTH_READ_TYPES] });
    const authorized = new Set(status.readAuthorized || []);
    return HEALTH_READ_TYPES.every((t) => authorized.has(t)) ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

/** Opens the Health Connect permission sheet. Returns granted types. */
export async function requestHealthAuthorization(): Promise<HealthAuthorizationState> {
  if (!isHealthConnectSupported()) return 'unknown';
  try {
    const status = await Health.requestAuthorization({ read: [...HEALTH_READ_TYPES] });
    const authorized = new Set(status.readAuthorized || []);
    return HEALTH_READ_TYPES.every((t) => authorized.has(t)) ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

/** Health Connect has its own settings screen (Item 0 override). */
export async function openHealthConnectSettings(): Promise<void> {
  if (!isHealthConnectSupported()) return;
  try {
    await Health.openHealthConnectSettings();
  } catch {
    /* settings intent unavailable — caller still shows the purpose line */
  }
}

export interface HealthFetchResult {
  summary: HealthDaySummary;
  weights: HealthWeightSample[];
}

/**
 * Read the last two days of steps, last night's sleep, and the last
 * 30 days of weight samples. Native + authorized only; callers check
 * first. Throws on native read failure so the UI can report honestly.
 */
export async function fetchHealthData(now: Date = new Date()): Promise<HealthFetchResult> {
  const today = getLocalTodayStr(now);
  const yesterday = shiftDateStr(today, -1);
  const twoDaysAgoStart = new Date(now);
  twoDaysAgoStart.setDate(twoDaysAgoStart.getDate() - 2);
  twoDaysAgoStart.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [stepsAgg, sleepRes, weightRes] = await Promise.all([
    Health.queryAggregated({
      dataType: 'steps',
      startDate: twoDaysAgoStart.toISOString(),
      endDate: now.toISOString(),
      bucket: 'day',
      aggregation: 'sum',
    }),
    Health.readSamples({
      dataType: 'sleep',
      startDate: new Date(now.getTime() - 36 * 3600 * 1000).toISOString(),
      endDate: now.toISOString(),
      limit: 50,
      ascending: true,
    }),
    Health.readSamples({
      dataType: 'weight',
      startDate: thirtyDaysAgo.toISOString(),
      endDate: now.toISOString(),
      limit: 200,
      ascending: true,
    }),
  ]);

  const stepsByDate = aggregateStepsByDate(
    (stepsAgg.samples || []).map((s) => ({ startDate: s.startDate, value: s.value }))
  );
  // Some providers don't support step aggregation; fall back to raw samples.
  if (Object.keys(stepsByDate).length === 0) {
    const raw = await Health.readSamples({
      dataType: 'steps',
      startDate: twoDaysAgoStart.toISOString(),
      endDate: now.toISOString(),
      limit: 500,
      ascending: true,
    });
    Object.assign(stepsByDate, aggregateStepsByDate(raw.samples || []));
  }

  const sleepSamples: HealthSample[] = sleepRes.samples || [];
  const summary: HealthDaySummary = {
    date: today,
    stepsToday: stepsByDate[today] || 0,
    stepsYesterday: stepsByDate[yesterday] || 0,
    sleepMinutesLastNight: summarizeSleepMinutes(sleepSamples, today),
  };
  return { summary, weights: latestWeightsByDate(weightRes.samples || []) };
}
