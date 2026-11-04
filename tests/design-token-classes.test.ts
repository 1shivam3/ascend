/**
 * F-02 regression guard (Final Certification Round 2a).
 *
 * The Form Coach feature shipped styled with utility classes that do not
 * exist in the design system (`accent-primary`, `surface-base`,
 * `text-on-accent`, the removed `3xs`/`4xs` sizes): Tailwind generated no
 * CSS for them, so the feature's primary buttons, surfaces and labels
 * silently rendered unstyled and ignored every theme. Nothing failed —
 * the classes were dead strings, invisible to tsc, eslint and the whole
 * unit suite. This test makes that failure mode impossible to re-ship:
 *
 *   Every colour-utility class referenced in src/**\/*.tsx whose name
 *   points at a design-token family (or the default palette) must
 *   resolve to a colour that tailwind.config.js actually defines.
 *   Every `text-` utility must resolve to a defined colour or a
 *   defined font size.
 *
 * Scope notes:
 *  - .tsx only: class strings live in components. (Prose in .ts files,
 *    e.g. the words "text-only" in an ai-provider comment, is not a
 *    class and is out of scope.)
 *  - Only the colour-bearing prefixes are checked: bg, text, border,
 *    ring, from, via, to, shadow. Non-colour utilities that share a
 *    prefix (bg-gradient-to-r, border-2, ring-inset, shadow-md…) are
 *    skipped unless the name actually references a token family.
 *  - Arbitrary values (bg-[#fff]) and dynamically built fragments
 *    (bg-${tone}) cannot be resolved statically and are skipped.
 *  - Default-palette utilities (bg-emerald-500, text-sky-400…) resolve
 *    and therefore pass; whether they SHOULD be used over the semantic
 *    tokens is audit finding F-03, a separate programme item — this
 *    guard only forbids classes that generate no style at all.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tailwindConfig: any = require('../tailwind.config.js');

function flattenColors(obj: Record<string, unknown>, prefix: string, out: Set<string>): Set<string> {
  for (const [key, value] of Object.entries(obj)) {
    const name = key === 'DEFAULT' ? prefix : prefix ? `${prefix}-${key}` : key;
    if (typeof value === 'string') out.add(name);
    else if (value && typeof value === 'object') flattenColors(value as Record<string, unknown>, name, out);
  }
  return out;
}

const CONFIG_COLORS = flattenColors(tailwindConfig.theme.extend.colors, '', new Set<string>());
const CONFIG_ROOTS = new Set(Object.keys(tailwindConfig.theme.extend.colors));

const PALETTE_ROOTS = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber',
  'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue',
  'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];
const PALETTE_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const PALETTE_NAMES = new Set(['black', 'white', 'transparent', 'current', 'inherit']);
for (const rootName of PALETTE_ROOTS) {
  for (const shade of PALETTE_SHADES) PALETTE_NAMES.add(`${rootName}-${shade}`);
}

const FONT_SIZES = new Set([
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
  ...Object.keys(tailwindConfig.theme.extend.fontSize),
]);
const SHADOW_SIZES = new Set([
  'xs', 'sm', 'md', 'lg', 'xl', '2xl', 'inner', 'none',
  ...Object.keys(tailwindConfig.theme.extend.boxShadow ?? {}),
]);
const COLOR_LIKE_ROOTS = new Set([
  ...CONFIG_ROOTS, ...PALETTE_ROOTS, 'black', 'white', 'transparent', 'current', 'inherit',
]);
// text- utilities that are neither colour nor size.
const TEXT_NON_COLOR = new Set([
  'left', 'center', 'right', 'justify', 'start', 'end',
  'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip',
]);

const UTIL_RE = /^(bg|text|border|ring|from|via|to|shadow)-(.+)$/;
const TOKEN_RE = /[A-Za-z0-9_\-/:.\[\]%!]+/g;

export function classResolves(rawToken: string): boolean {
  let tok = rawToken.split(':').pop() ?? ''; // strip variant prefixes (hover:, sm:, …)
  tok = tok.replace(/^!/, '').replace(/^-/, '');
  const m = tok.match(UTIL_RE);
  if (!m) return true; // not a colour-utility shape — not this guard's concern
  const [, prefix, rest] = m;
  if (rest.includes('[') || rest.includes('$')) return true; // arbitrary / dynamic
  const name = rest.replace(/\/(\d+(\.\d+)?|\[[^\]]*\])$/, ''); // strip /alpha
  if (!name) return true;
  if (/^[\d.]+%$/.test(name) || /^[\d.]+$/.test(name)) return true; // gradient stops, widths
  if (prefix === 'text') {
    if (TEXT_NON_COLOR.has(name) || name.startsWith('opacity-')) return true;
    return CONFIG_COLORS.has(name) || PALETTE_NAMES.has(name) || FONT_SIZES.has(name);
  }
  // Other prefixes: only validate when the name references a colour family.
  if (!COLOR_LIKE_ROOTS.has(name.split('-')[0])) return true;
  if (CONFIG_COLORS.has(name) || PALETTE_NAMES.has(name)) return true;
  if (prefix === 'shadow' && SHADOW_SIZES.has(name)) return true;
  return false;
}

function listTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsx(p));
    else if (entry.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('design-token class guard (F-02)', () => {
  it('validator resolves the live token scheme', () => {
    for (const ok of [
      'bg-accent', 'text-accent-on', 'bg-accent/10', 'hover:bg-accent-dim',
      'bg-surface', 'bg-surface-elevated', 'bg-surface-highlight',
      'text-text-primary', 'text-text-muted', 'border-border-subtle',
      'shadow-accent/20', 'from-accent', 'bg-bg-card', 'text-accent-text',
      'text-2xs', 'text-label', 'bg-emerald-500/15', 'text-sky-400',
      'bg-gradient-to-r', 'border-2', 'shadow-md', 'bg-black/60',
    ]) {
      expect(classResolves(ok), ok).toBe(true);
    }
  });

  it('validator rejects the classes that shipped dead in F-02', () => {
    for (const dead of [
      'bg-accent-primary', 'text-accent-primary', 'border-accent-primary/30',
      'from-accent-primary', 'shadow-accent-primary/20', 'bg-surface-base',
      'bg-surface-base/60', 'text-text-on-accent', 'text-3xs', 'text-4xs',
      'hover:bg-accent-hover', 'hover:text-accent-hover',
    ]) {
      expect(classResolves(dead), dead).toBe(false);
    }
  });

  it('every colour-utility class in src/**/*.tsx resolves to a defined token', () => {
    const files = listTsx(join(process.cwd(), 'src'));
    expect(files.length).toBeGreaterThan(50);
    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const rel = file.replace(`${process.cwd()}/`, '');
      for (const raw of text.match(TOKEN_RE) ?? []) {
        if (!classResolves(raw)) violations.push(`${rel}: ${raw}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
