/**
 * Open-items UX F-07 (P2): Terms and Privacy body copy was set at
 * text-2xs (11px) in monospace — including the free-tier AI disclosure.
 * Body copy now renders in the app's sans stack at text-sm (14px) via
 * the sections wrapper; headings, structure and EVERY word of legal
 * content are unchanged (presentation only — LEGAL_VERSION untouched).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('open-items UX F-07: legal pages readable', () => {
  for (const page of ['src/app/terms/page.tsx', 'src/app/privacy/page.tsx']) {
    it(`${page}: no 11px body text remains`, () => {
      const src = read(page);
      expect(src).not.toContain('text-2xs');
    });

    it(`${page}: sections wrapper carries sans text-sm body copy`, () => {
      const src = read(page);
      expect(src).toContain('space-y-6 text-sm text-text-secondary leading-relaxed');
      // The body wrapper must not reinstate the mono presentation.
      expect(src).not.toMatch(/space-y-6 text-(xs|2xs) font-mono/);
    });
  }

  it('terms: summary box + warning box are text-sm, disclosure wording intact', () => {
    const src = read('src/app/terms/page.tsx');
    expect(src).toContain('space-y-2 text-sm text-text-secondary');
    expect(src).toContain('text-amber-200/90 text-sm space-y-2');
    expect(src).toContain('Free-Tier Models &amp; Your Data:');
    expect(src).toContain('Key Takeaways');
  });

  it('privacy: guarantee card + data-safety box are text-sm, disclosure wording intact', () => {
    const src = read('src/app/privacy/page.tsx');
    expect(src).toContain('text-emerald-300 text-sm space-y-1.5');
    expect(src).toContain('Free-Tier Text Models &amp; Data Use:');
    expect(src).toContain('Summary of Data Practices for App Store Reviewers');
  });
});
