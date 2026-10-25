import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import FlameMascot from '@/components/onboarding/FlameMascot';
import MascotSplash from '@/components/onboarding/MascotSplash';

// PNG IHDR dimensions without an image library: signature(8) + length(4)
// + 'IHDR'(4) + width(4 BE) + height(4 BE).
function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const pub = (f: string) => path.resolve('public', f);

describe('logo icon set (flame-2 mark)', () => {
  it('ships the full PWA set at the right dimensions', () => {
    expect(pngSize(pub('icon-192.png'))).toEqual({ width: 192, height: 192 });
    expect(pngSize(pub('icon-512.png'))).toEqual({ width: 512, height: 512 });
    expect(pngSize(pub('icon-maskable-512.png'))).toEqual({ width: 512, height: 512 });
  });

  it('keeps the manifest references intact (filenames unchanged)', () => {
    const manifest = JSON.parse(fs.readFileSync(pub('manifest.json'), 'utf8'));
    const srcs = (manifest.icons as { src: string }[]).map((i) => i.src);
    expect(srcs).toEqual(['/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']);
  });

  it('icon.svg is self-contained (embedded raster, not a stale vector)', () => {
    const svg = fs.readFileSync(pub('icon.svg'), 'utf8');
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toContain('data:image/png;base64,');
    expect(svg).not.toContain('#e5c07b'); // old gold A must be gone
  });

  it('favicon.ico exists for the existing /favicon.ico reference', () => {
    const buf = fs.readFileSync(pub('favicon.ico'));
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(1); // ICO magic
    expect(buf[3]).toBe(0);
  });
});

describe('flame mascot (SVG)', () => {
  it('renders a flame with an A cutout, eyes, and a smile', () => {
    const markup = renderToStaticMarkup(<FlameMascot size={56} tone="brand" />);
    expect(markup).toContain('<svg');
    expect(markup).toContain('evenodd'); // A-shaped negative space
    expect(markup.match(/<circle/g)?.length).toBeGreaterThanOrEqual(4); // eyes + pupils
    expect(markup).toContain('Q100 118'); // smile curve
  });

  it('dark tone uses the graphite token, brand tone uses accent', () => {
    const dark = renderToStaticMarkup(<FlameMascot size={56} tone="dark" />);
    const brand = renderToStaticMarkup(<FlameMascot size={56} tone="brand" />);
    expect(dark).toContain('text-brand-graphite');
    expect(brand).toContain('text-accent');
  });
});

describe('mascot splash intro', () => {
  it('renders the full-screen splash overlay (non-reduced-motion)', () => {
    (global as any).window = {
      matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    };
    const markup = renderToStaticMarkup(<MascotSplash onDone={() => {}} />);
    expect(markup).toContain('Tap to continue');
    expect(markup).toContain('bg-accent');
    expect(markup).toContain('<svg');
  });

  it('renders nothing under reduced motion (straight to content)', () => {
    (global as any).window = {
      matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    };
    const markup = renderToStaticMarkup(<MascotSplash onDone={() => {}} />);
    expect(markup).toBe('');
  });

  it('stagger utilities exist and are gated to motion-allowed', () => {
    const css = fs.readFileSync(path.resolve('src/app/globals.css'), 'utf8');
    expect(css).toContain('.stagger-60');
    expect(css).toContain('.stagger-120');
    const noPref = css.indexOf('prefers-reduced-motion: no-preference');
    expect(noPref).toBeGreaterThan(-1);
    expect(css.indexOf('.stagger-60')).toBeGreaterThan(noPref);
  });
});
