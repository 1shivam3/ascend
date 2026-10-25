/**
 * UX redesign Stage 9 — accessibility + responsive regression pins.
 *
 * Contrast audit, extended from Stage 1's token audit to every USE:
 * focus ring (accent vs page background, UI-only ≥3:1), selected-state
 * chip (accent-text on the accent-subtle blend, ≥4.5:1), chart series
 * (accent never the sole carrier — labels/dashes/badges/detail text).
 * Touch targets: no 40px buttons remain (close buttons, set pills,
 * back buttons, quick actions, shared Button sm/icon all at 44px).
 * Widths/layout: fluid charts (viewBox + w-full), 520px modal cap,
 * 232px rail, max-w-md column — verified in code, not screenshots.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ACCENT_PRESETS,
  PAGE_BACKGROUND,
  deriveCustomAccent,
  isCustomAccentUsable,
  contrastRatio,
  hexToRgb,
} from '../src/lib/accent-themes';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Blend an rgba() subtle wash over the page background, per channel. */
function blendOverPage(subtle: string, bgHex: string): string | null {
  const m = subtle.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) return subtle.startsWith('#') ? subtle : null;
  const bg = hexToRgb(bgHex);
  if (!bg) return null;
  const a = parseFloat(m[4]);
  const ch = (fg: number, b: number) => Math.round(a * fg + (1 - a) * b);
  const r = ch(+m[1], bg.r);
  const g = ch(+m[2], bg.g);
  const b = ch(+m[3], bg.b);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const CUSTOM_CASES = ['#F5EFE0', '#1A1A2E', '#808080', '#FFEB00', '#E44427'];

describe('Stage 9 — contrast audit, every use', () => {
  it.each(ACCENT_PRESETS)('preset $id: focus ring (accent vs bg) ≥3:1 in both modes', (preset) => {
    for (const mode of ['light', 'dark'] as const) {
      const ratio = contrastRatio(preset[mode].accent, PAGE_BACKGROUND[mode]);
      expect(ratio, `${preset.id}/${mode} focus ring`).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(ACCENT_PRESETS)('preset $id: selected chip (accent-text on subtle blend) ≥4.5:1 in both modes', (preset) => {
    for (const mode of ['light', 'dark'] as const) {
      const v = preset[mode];
      const blended = blendOverPage(v.subtle, PAGE_BACKGROUND[mode]);
      expect(blended, `${preset.id}/${mode} blend`).not.toBeNull();
      const ratio = contrastRatio(v.text, blended!);
      expect(ratio, `${preset.id}/${mode} chip ${v.text} on ${blended}`).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(CUSTOM_CASES)('custom %s: focus ring ≥3:1 and chip ≥4.5:1 in both modes, or rejected at input', (hex) => {
    // Hexes that fail the light-background UI pairing never ship: the
    // input gate rejects them (error + Apply blocked) instead of the
    // derivation silently changing the user's chosen accent.
    if (!isCustomAccentUsable(hex)) {
      expect(['#F5EFE0', '#FFEB00']).toContain(hex);
      return;
    }
    for (const mode of ['light', 'dark'] as const) {
      const derived = deriveCustomAccent(hex, mode);
      expect(derived, `${hex}/${mode} derives`).not.toBeNull();
      const v = derived!.variant;
      expect(contrastRatio(v.accent, PAGE_BACKGROUND[mode])!).toBeGreaterThanOrEqual(3);
      const blended = blendOverPage(v.subtle, PAGE_BACKGROUND[mode]);
      expect(blended).not.toBeNull();
      expect(contrastRatio(v.text, blended!)!).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('input gate rejects near-background hexes and accepts the rest', () => {
    expect(isCustomAccentUsable('#F5EFE0')).toBe(false);
    expect(isCustomAccentUsable('#FFEB00')).toBe(false);
    expect(isCustomAccentUsable('#1A1A2E')).toBe(true);
    expect(isCustomAccentUsable('#808080')).toBe(true);
    expect(isCustomAccentUsable('#E44427')).toBe(true);
    expect(isCustomAccentUsable('not-a-color')).toBe(false);
  });

  it('SettingsView blocks Apply for a too-close hex (error + null preview)', () => {
    const settings = read('src/components/SettingsView.tsx');
    expect(settings).toContain('isCustomAccentUsable');
    expect(settings).toContain('settings.customAccentTooClose');
    expect(settings).toContain('customError ? null : (customDerived?.variant ?? null)');
  });
});

describe('Stage 9 — touch targets, focus, layout', () => {
  it('no 40px button sizes remain in src (44px floor)', () => {
    const offenders: string[] = [];
    const { readdirSync, statSync } = require('fs');
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir)) {
        const f = join(dir, e);
        if (statSync(f).isDirectory()) {
          if (e !== 'node_modules') out.push(...walk(f));
        } else if (f.endsWith('.tsx')) out.push(f);
      }
      return out;
    };
    for (const f of walk(join(process.cwd(), 'src'))) {
      const src = readFileSync(f, 'utf8');
      if (/min-h-\[40px\]|min-w-\[40px\]/.test(src)) {
        // The only survivors are two non-interactive row containers.
        const lines = src.split('\n');
        lines.forEach((line, i) => {
          if (/min-h-\[40px\]|min-w-\[40px\]/.test(line) && !line.trim().startsWith('<div')) {
            offenders.push(`${f}:${i + 1}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keyboard focus is visible on buttons, links, and switches', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('button:focus-visible');
    // Micro-fix L12 (round 2): the Stage 9 pin asserted the bare
    // `var(--accent)` form — invalid, because --accent is an RGB triplet,
    // not a color, so the declaration was dropped at parse time. The
    // valid form is rgb(var(--accent)).
    expect(css).toContain('outline: 2px solid rgb(var(--accent))');
    expect(css).not.toContain('outline: 2px solid var(--accent)');
  });

  it('modal-stack semantics still route through use-modal-a11y', () => {
    const sheet = read('src/components/ui/Sheet.tsx');
    expect(sheet).toContain('useModalA11y');
  });

  it('charts are fluid (viewBox + w-full, no fixed 320px overflow)', () => {
    const progress = read('src/components/ProgressPage.tsx');
    expect(progress).toContain('viewBox="0 0 320');
    expect(progress).toContain('className="w-full h-28 overflow-visible"');
  });

  it('desktop rail, modal cap, and heatmap text equivalents hold', () => {
    const page = read('src/app/page.tsx');
    expect(page).toContain('lg:ml-[232px]');
    const css = read('src/app/globals.css');
    expect(css).toContain('max-w-[520px]');
    const heat = read('src/components/WorkoutHeatmap.tsx');
    expect(heat).toContain("t('heat.cellSummary'");
    const muscle = read('src/components/MuscleVolumeSection.tsx');
    expect(muscle).toContain('{row.muscle}');
  });
});
