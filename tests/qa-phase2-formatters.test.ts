/**
 * QA-hardening Phase 2, R12 — one formatter set, used everywhere.
 *
 * The brief's observed inconsistencies: "1800 kg" vs "1,800 kg",
 * "2592" vs "2,592", water as "0 ml / 2.5 L" on one screen and
 * "0.0 / 2.5 L" on another, and US-order dates ("Nov 6, 2026") in an
 * app whose audience is India-based.
 *
 * This file pins:
 *  - the completed formatter family in src/lib/formatters
 *    (formatNumber, formatVolume, formatWater, formatCalories,
 *    formatDate, formatDateShort, formatDuration),
 *  - the ONE date style: day-first "Mon, 2 Nov 2026" (full) and
 *    "2 Nov" (short), weekday/month names still localized,
 *  - the ONE water rule: under 1000 ml shows ml, otherwise litres
 *    with one decimal,
 *  - a source guard: no new ad-hoc unit/date strings outside the
 *    formatters. Existing exceptions are enumerated in ALLOWLIST
 *    with a reason each; a stale allowlist entry also fails, so the
 *    list can only shrink.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  formatNumber,
  formatVolume,
  formatWater,
  formatCalories,
  formatDate,
  formatDateShort,
  formatDuration,
} from '../src/lib/formatters';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('R12 — the formatter family', () => {
  it('formatNumber groups thousands (pre-existing)', () => {
    expect(formatNumber(2592, 'en-US')).toBe('2,592');
  });

  it('formatVolume converts kg to the display unit and groups', () => {
    expect(formatVolume(1800, 'kg', 'en-US')).toBe('1,800 kg');
    expect(formatVolume(62.5, 'kg', 'en-US')).toBe('62.5 kg');
    expect(formatVolume(100, 'lbs', 'en-US')).toBe('220 lbs');
    expect(formatVolume(0, 'kg', 'en-US')).toBe('0 kg');
  });

  it('formatWater: ml under a litre, one-decimal litres above', () => {
    expect(formatWater(0)).toBe('0 ml');
    expect(formatWater(250)).toBe('250 ml');
    expect(formatWater(999)).toBe('999 ml');
    expect(formatWater(1000)).toBe('1 L');
    expect(formatWater(2500)).toBe('2.5 L');
    expect(formatWater(3000)).toBe('3 L');
  });

  it('formatCalories groups and suffixes once', () => {
    expect(formatCalories(2592, 'en-US')).toBe('2,592 kcal');
    expect(formatCalories(450, 'en-US')).toBe('450 kcal');
  });

  it('formatDate is day-first: "Mon, 2 Nov 2026"', () => {
    expect(formatDate('2026-11-02', 'en-US')).toBe('Mon, 2 Nov 2026');
    expect(formatDate('2026-11-06', 'en-US')).toBe('Fri, 6 Nov 2026');
  });

  it('formatDateShort is day-first without the year', () => {
    expect(formatDateShort('2026-11-02', 'en-US')).toBe('2 Nov');
    expect(formatDateShort('2026-11-02', 'en-US', { weekday: true })).toBe('Mon, 2 Nov');
  });

  it('formatDuration (pre-existing) still anchors the set', () => {
    expect(formatDuration(90)).toBe('1m 30s');
  });

  it('the old duplicate water formatter is gone from habits.ts', () => {
    const habits = read('src/lib/habits.ts');
    expect(habits).not.toContain('export function formatWaterLiters');
  });

  it('Today no longer formats water as decimal litres by hand', () => {
    const home = read('src/components/HomePage.tsx');
    expect(home).not.toContain('(todayWaterMl / 1000).toFixed(1)');
    expect(home).toContain('formatWater(todayWaterMl)');
  });
});

// ─── The guard ────────────────────────────────────────────────────────
// Patterns that mean "a display string was built by hand instead of
// through src/lib/formatters":
//   tls  — .toLocaleString(            (hand-grouped numbers)
//   tdls — toLocaleDateString( / toDateString(  (hand-built dates)
//   unit — a template literal gluing a value to kg/lbs/ml/kcal
const PATTERNS: Record<string, RegExp> = {
  tls: /\.toLocaleString\(/,
  tdls: /toLocaleDateString\(|toDateString\(/,
  unit: /`[^`]*\$\{[^`]*\}\s?(kg|lbs|ml|kcal)\b/,
};

// Every remaining hit must be listed here with its reason. Matching is
// by file + a substring of the offending line, so an entry dies with
// its line — and the stale-entry check below fails the suite when an
// entry no longer matches anything (the list can only shrink).
const ALLOWLIST: { file: string; match: string; reason: string }[] = [
  // Model-context strings: machine-read prompt context, values are
  // pre-rounded by the builders; grouping/locale is irrelevant to the
  // model and these never render in the UI.
  { file: 'src/lib/ai-context.ts', match: 'ThisWeek=', reason: 'AI model context string, never rendered' },
  { file: 'src/lib/coach-chat.ts', match: 'NUTRITION TODAY:', reason: 'AI model context string, never rendered' },
  { file: 'src/lib/coach-chat.ts', match: "Today's food so far:", reason: 'AI model context string, never rendered' },
  { file: 'src/lib/coach-chat.ts', match: 'kcal`,', reason: 'AI model context string (goal summary), never rendered' },
  { file: 'src/lib/coach-chat.ts', match: '(target: ${Math.round(data.macroGoals.calories)} kcal', reason: 'AI model context string (continuation line), never rendered' },
  // Rates and prescription increments in canonical kg: always small
  // (< 1000), so grouping can never differ; kg is the engine unit and
  // these strings are evidence/explanation text, not weight displays.
  { file: 'src/lib/athlete-model.ts', match: 'kg/week', reason: 'rate in canonical kg, always < 1000' },
  { file: 'src/lib/athlete-model.ts', match: 'you typically add', reason: 'median jump in canonical kg, always < 1000' },
  { file: 'src/lib/block-engine.ts', match: 'kg between good sessions', reason: 'typical increment in canonical kg, always < 1000' },
  { file: 'src/lib/block-engine.ts', match: 'add ${inc.incrementKg} kg', reason: 'prescription increment in canonical kg, always < 1000' },
  { file: 'src/lib/block-engine.ts', match: 'adds ${base.incrementKg} kg', reason: 'prescription increment in canonical kg, always < 1000' },
  { file: 'src/lib/block-engine.ts', match: 'kg/week', reason: 'rate in canonical kg, always < 1000' },
  { file: 'src/lib/coach-chat.ts', match: 'kg/week', reason: 'rate in canonical kg, always < 1000' },
  { file: 'src/lib/coach-engine.ts', match: 'kg/week', reason: 'rate in canonical kg, always < 1000' },
  // Server-side diagnostic log line, not a UI string.
  { file: 'src/app/api/ai/scan-meal/route.ts', match: 'kcal and', reason: 'server log line, not rendered' },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  kind: string;
  text: string;
}

function scan(): Hit[] {
  const root = process.cwd();
  const files = walk(path.join(root, 'src')).filter(
    (f) => !f.endsWith(path.join('lib', 'formatters.ts')),
  );
  const hits: Hit[] = [];
  for (const f of files) {
    const rel = path.relative(root, f);
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((text, i) => {
      for (const [kind, re] of Object.entries(PATTERNS)) {
        if (re.test(text)) hits.push({ file: rel, line: i + 1, kind, text });
      }
    });
  }
  return hits;
}

describe('R12 — guard: no ad-hoc unit/date strings outside the formatters', () => {
  const hits = scan();

  it('every hit is allowlisted with a reason', () => {
    const unlisted = hits.filter(
      (h) => !ALLOWLIST.some((a) => a.file === h.file && h.text.includes(a.match)),
    );
    expect(
      unlisted.map((h) => `${h.file}:${h.line} [${h.kind}] ${h.text.trim()}`),
    ).toEqual([]);
  });

  it('no stale allowlist entries (the list can only shrink)', () => {
    const stale = ALLOWLIST.filter(
      (a) => !hits.some((h) => h.file === a.file && h.text.includes(a.match)),
    );
    expect(stale).toEqual([]);
  });
});
