import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Pre-play D-UX-1 / D-UX-3 / D-UX-5 / D-UX-6 and the remaining
// D-A11Y-4 SVGs — source pins in the repo's established style.
const read = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('pre-play check-in pre-highlight (D-UX-1)', () => {
  const coach = read('src/components/CoachChatTab.tsx');

  it('rating chips only read as selected after a real tap', () => {
    expect(coach).toContain('touchedRatings');
    // The Chip active prop is gated on the touched set…
    expect(coach).toContain('touchedRatings.has(key)');
    // …and "Same as usual" counts as answering all three.
    expect(coach).toContain("setTouchedRatings(new Set(['sleep', 'soreness', 'energy']))");
    // The raw seed-driven active expression is gone.
    expect(coach).not.toContain(
      "key === 'sleep' ? sleep === v : key === 'soreness' ? soreness === v : energy === v\n            }",
    );
  });
});

describe('pre-play Progress text joins + empty states (D-UX-3/6)', () => {
  const progress = read('src/components/ProgressPage.tsx');

  it('est. badge no longer concatenates onto the lift name (D-UX-3)', () => {
    expect(progress).toContain("Pre-play D-UX-3: explicit space in the text flow");
    expect(progress).toContain("{' '}{t('common.estimatedShort')}");
  });

  it('untrained lifts and unlogged metrics show guidance, not a bare dash (D-UX-6)', () => {
    expect(progress).toContain("t('progress.noDataYet')");
    expect(progress).not.toContain("bodyFatPct !== undefined ? `${latestMetrics.bodyFatPct}%` : '—'");
    const en = read('src/lib/i18n/en.ts');
    const hi = read('src/lib/i18n/hi.ts');
    expect(en).toContain("'progress.noDataYet'");
    expect(hi).toContain("'progress.noDataYet'");
  });

  it('chart strokes are theme variables, not hard-coded hex (D-UX-4c)', () => {
    expect(progress).not.toContain('stroke="#E44427"');
    expect(progress).not.toContain('fill="#E44427"');
    expect(progress).not.toContain('stopColor="#E44427"');
    expect(progress).not.toContain('stroke="#858076"');
    expect(progress).toContain('stroke="rgb(var(--accent))"');
    expect(progress).toContain('stroke="rgb(var(--text-secondary))"');
  });
});

describe('pre-play chart paints wrap RGB-triplet tokens in rgb() (D-UX-4 follow-up)', () => {
  // Root cause of the Graphite "invisible detail chart": --accent,
  // --text-secondary and --bg-card are space-separated RGB triplets, so a
  // bare var(--accent) as an SVG paint is invalid — the declaration drops
  // and the series falls back to stroke:none (no line) + fill black
  // (black points) + stop-color black (faint dark area). Round 1's pin
  // above originally asserted the bare form; this block pins the fix.
  const progress = read('src/components/ProgressPage.tsx');
  const chart = read('src/components/ProgressChart.tsx');
  const css = read('src/app/globals.css');

  it('theme tokens stay RGB triplets (app-wide Tailwind rgb(var()/alpha) wiring depends on it)', () => {
    expect(css).toContain('--accent: 228 68 39;');
    expect(css).toContain('--accent: 235 78 48;');
  });

  it('no bare triplet token is used as an SVG paint in either chart file', () => {
    for (const src of [progress, chart]) {
      expect(src).not.toContain('stroke="var(--');
      expect(src).not.toContain('fill="var(--');
      expect(src).not.toContain('stopColor="var(--');
      expect(src).not.toContain("'var(--accent)'");
      expect(src).not.toContain("'var(--bg-card)'");
    }
  });

  it('every Progress chart resolves its paints through rgb(var())', () => {
    expect(progress).toContain('stopColor="rgb(var(--accent))"');
    expect(progress).toContain('fill="rgb(var(--accent))"');
    expect(progress).toContain('stopColor="rgb(var(--text-secondary))"');
    expect(progress).toContain('fill="rgb(var(--text-secondary))"');
    expect(chart).toContain('stroke="rgb(var(--accent))"');
    expect(chart).toContain('stopColor="rgb(var(--accent))"');
  });

  it('detail-chart points are accent-filled with a card-colour ring on every point', () => {
    // The analytics (per-lift detail) chart: static ring, not last-point-only.
    expect(progress).toContain('stroke="rgb(var(--bg-card))"');
  });
});

describe('pre-play unit spacing (D-UX-5)', () => {
  it('plan card exercise count is a single spaced string', () => {
    const workout = read('src/components/WorkoutPage.tsx');
    expect(workout).toContain("{plural(plan.exercises.length, 'exercise')}");
    expect(workout).not.toContain("exercise{plan.exercises.length !== 1 ? 's' : ''}");
  });

  it('home XP total is a single spaced string', () => {
    const home = read('src/components/HomePage.tsx');
    expect(home).toContain('{`${levelInfo.total.toLocaleString()} XP`}');
  });
});

describe('pre-play SVG accessibility (D-A11Y-4)', () => {
  it('CircularProgress ring exposes its value', () => {
    const ring = read('src/components/ui/CircularProgress.tsx');
    expect(ring).toContain('role="img"');
    expect(ring).toContain('aria-label={`${Math.round(normalizedValue)}%`}');
  });

  it('Meals calorie donut exposes its value', () => {
    const meals = read('src/components/MealsPage.tsx');
    expect(meals).toContain('role="img" aria-label={`${Math.round(todayMacros.calories).toLocaleString()} cal,');
  });

  it('Google "G" logos are hidden from AT (button text names them)', () => {
    const auth = read('src/components/AuthModal.tsx');
    const social = read('src/components/onboarding/SocialAuthButtons.tsx');
    expect(auth).toContain('aria-hidden="true" focusable="false"');
    expect(social).toContain('aria-hidden="true" focusable="false"');
  });
});
