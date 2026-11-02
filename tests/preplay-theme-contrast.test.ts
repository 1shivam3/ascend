import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { contrastRatio, rgbToHex } from '@/lib/accent-themes';

// Pre-play D-UX-4 / D-A11Y-2 / D-A11Y-3: theme token contrast.
// Ratios are computed from the token values actually declared in
// globals.css (parsed, not copied), so a future token edit that drops
// a pairing below WCAG AA fails here.
const css = fs.readFileSync(
  path.join(process.cwd(), 'src/app/globals.css'),
  'utf8',
);

function block(selectorRe: RegExp): string {
  const m = css.match(selectorRe);
  if (!m) throw new Error(`theme block not found: ${selectorRe}`);
  return m[1];
}
const lightBlock = block(/:root\s*\{([\s\S]*?)\n\}/);
const darkBlock = block(/\.dark,\s*\n:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/);

function tokenHex(blockText: string, name: string): string {
  const m = blockText.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token --${name} not found`);
  const raw = m[1].trim();
  if (raw.startsWith('#')) return raw;
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`token --${name} is not an RGB triplet or hex: ${raw}`);
  }
  return rgbToHex(parts[0], parts[1], parts[2]);
}

const L = (n: string) => tokenHex(lightBlock, n);
const D = (n: string) => tokenHex(darkBlock, n);
const ratio = (a: string, b: string) => {
  const r = contrastRatio(a, b);
  if (r === null) throw new Error(`unparseable colours ${a} / ${b}`);
  return r;
};

describe('pre-play theme contrast (D-UX-4, D-A11Y-2/3)', () => {
  it('light muted text clears AA on sunken surfaces (D-A11Y-3)', () => {
    // Was #6E6A5E: 4.29:1 on secondary, 3.94:1 on tertiary.
    expect(ratio(L('text-muted'), L('bg-secondary'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(L('text-muted'), L('bg-tertiary'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(L('text-muted'), L('bg-primary'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(L('text-muted'), L('bg-card'))).toBeGreaterThanOrEqual(4.5);
  });

  it('dark muted text clears AA on elevated/card surfaces (D-A11Y-3)', () => {
    // Was #8B8F87: 3.96:1 on elevated, 4.55:1 on card.
    expect(ratio(D('text-muted'), D('bg-elevated'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(D('text-muted'), D('bg-card'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(D('text-muted'), D('bg-primary'))).toBeGreaterThanOrEqual(4.5);
  });

  it('dark secondary text clears AA on the main dark surfaces (D-UX-4a)', () => {
    for (const bg of ['bg-primary', 'bg-card', 'bg-elevated', 'bg-secondary']) {
      expect(ratio(D('text-secondary'), D(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('semantic warning/danger text colours clear AA in both themes (D-A11Y-2)', () => {
    // The Tailwind warning/danger/error utilities now resolve to these
    // per-theme tokens (previously hard-coded #F59E0B / #EF4444, which
    // measured 2.15:1 / 3.76:1 as light-theme text).
    expect(ratio(L('warning'), L('bg-card'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(L('warning'), L('bg-primary'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(L('danger'), L('bg-card'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(L('danger'), L('bg-primary'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(D('warning'), D('bg-card'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(D('warning'), D('bg-primary'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(D('danger'), D('bg-card'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(D('danger'), D('bg-primary'))).toBeGreaterThanOrEqual(4.5);
  });

  it('tailwind warning/danger/error utilities are token-wired, not hard-coded', () => {
    const config = fs.readFileSync(
      path.join(process.cwd(), 'tailwind.config.js'),
      'utf8',
    );
    expect(config).toContain("warning: 'rgb(var(--warning) / <alpha-value>)'");
    expect(config).toContain("danger: 'rgb(var(--danger) / <alpha-value>)'");
    expect(config).toContain("error: 'rgb(var(--danger) / <alpha-value>)'");
    expect(config).not.toContain("'#f59e0b'");
    expect(config).not.toContain("'#ef4444'");
  });

  it('Graphite filled-vermilion pairing is light text on deepened vermilion (D-UX-4b)', () => {
    // The unlayered .dark override pairs chalk with accent-dim.
    expect(css).toContain('.dark .bg-accent.text-accent-on');
    expect(ratio('#F3F0E7', D('accent-dim'))).toBeGreaterThanOrEqual(4.5);
    // And the pairing it replaced could not have carried light text:
    expect(ratio('#F3F0E7', D('accent'))).toBeLessThan(4.5);
  });

  it('chart colours are theme-driven with graphic contrast on cards (D-UX-4c)', () => {
    // Accent line (both themes) and the weight chart's text-secondary
    // line must read as graphics (≥3:1) on the card they sit on.
    expect(ratio(L('accent'), L('bg-card'))).toBeGreaterThanOrEqual(3);
    expect(ratio(D('accent'), D('bg-card'))).toBeGreaterThanOrEqual(3);
    expect(ratio(L('text-secondary'), L('bg-card'))).toBeGreaterThanOrEqual(3);
    expect(ratio(D('text-secondary'), D('bg-card'))).toBeGreaterThanOrEqual(3);
  });
});
