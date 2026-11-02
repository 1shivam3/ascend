/**
 * Accessible names for the hand-drawn SVG charts (final-cert UX F-04).
 *
 * The Progress charts are bare <svg> elements with no role or label —
 * a screen-reader user got controls and headline numbers but no trend,
 * which is the point of the screen. summarizeSeries builds the chart's
 * aria-label from the SAME data points the chart plots: the metric /
 * exercise, the latest value, and the direction + size of the change
 * over the shown range. Pure and unit-testable; visuals are untouched.
 */

export interface SeriesPoint {
  date: string;
  value: number;
}

function fmtValue(v: number, unit: string): string {
  return `${Math.round(v * 10) / 10} ${unit}`;
}

export function summarizeSeries(label: string, points: SeriesPoint[], unit: string): string {
  if (!points || points.length === 0) return `${label} chart: no data yet`;
  const latest = points[points.length - 1];
  if (points.length === 1) {
    return `${label} chart: latest ${fmtValue(latest.value, unit)} on ${latest.date} (single data point)`;
  }
  const first = points[0];
  const change = Math.round((latest.value - first.value) * 10) / 10;
  const changeText =
    change === 0
      ? 'unchanged over the shown range'
      : `${change > 0 ? 'rose' : 'fell'} by ${Math.abs(change)} ${unit} over the shown range`;
  return (
    `${label} chart: latest ${fmtValue(latest.value, unit)} on ${latest.date}, ` +
    `${changeText} (${points.length} data points, ${first.date} to ${latest.date})`
  );
}
