/**
 * Final-cert UX F-04 (P2): Progress charts were hand-drawn SVG with no
 * accessible name or text alternative. Every chart SVG now carries
 * role="img" and an aria-label from summarizeSeries (lib/chart-a11y),
 * computed from the same data points the chart plots: metric/exercise,
 * latest value, and direction/change over the shown range. Visuals are
 * unchanged.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { summarizeSeries } from '../src/lib/chart-a11y';

describe('final-cert UX F-04: summarizeSeries', () => {
  it('rising series: exercise, latest value, direction and change over the range', () => {
    const label = summarizeSeries(
      'Bench Press estimated 1RM',
      [
        { date: '2026-10-05', value: 100 },
        { date: '2026-10-19', value: 110 },
      ],
      'kg',
    );
    expect(label).toContain('Bench Press estimated 1RM');
    expect(label).toContain('latest 110 kg');
    expect(label).toContain('rose by 10 kg');
    expect(label).toContain('2026-10-05 to 2026-10-19');
  });

  it('falling and flat series are described honestly', () => {
    expect(
      summarizeSeries('Bodyweight', [
        { date: '2026-10-05', value: 82 },
        { date: '2026-10-19', value: 80.5 },
      ], 'kg'),
    ).toContain('fell by 1.5 kg');
    expect(
      summarizeSeries('Bodyweight', [
        { date: '2026-10-05', value: 80 },
        { date: '2026-10-19', value: 80 },
      ], 'kg'),
    ).toContain('unchanged');
  });

  it('single point and empty series', () => {
    expect(summarizeSeries('Squat estimated 1RM', [{ date: '2026-10-05', value: 31 }], 'kg')).toContain(
      'single data point',
    );
    expect(summarizeSeries('Squat estimated 1RM', [], 'kg')).toContain('no data yet');
  });
});

describe('final-cert UX F-04: chart SVGs carry role="img" + aria-label', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  it('all five ProgressPage chart SVGs', () => {
    const src = read('src/components/ProgressPage.tsx');
    const svgTags = src.match(/<svg viewBox="0 0 320[^>]*>/g) || [];
    expect(svgTags.length).toBe(5);
    for (const tag of svgTags) {
      expect(tag).toContain('role="img"');
      expect(tag).toContain('aria-label={summarizeSeries(');
    }
  });

  it('the ProgressChart sparkline', () => {
    const src = read('src/components/ProgressChart.tsx');
    expect(src).toContain('role="img"');
    expect(src).toContain('aria-label={summarizeSeries(');
  });
});
