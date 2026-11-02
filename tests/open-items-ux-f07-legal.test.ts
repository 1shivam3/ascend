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
    expect(src).toContain('text-amber-900 dark:border-amber-500/20 dark:text-amber-200/90 text-sm space-y-2');
    expect(src).toContain('Free-Tier Models &amp; Your Data:');
    expect(src).toContain('Key Takeaways');
  });

  it('privacy: guarantee card + data-safety box are text-sm, disclosure wording intact', () => {
    const src = read('src/app/privacy/page.tsx');
    expect(src).toContain('dark:text-emerald-200/90 text-sm space-y-1.5');
    expect(src).toContain('Free-Tier Text Models &amp; Data Use:');
    expect(src).toContain('Summary of Data Practices for App Store Reviewers');
  });

  // Follow-up (2026-11-01, preview spot-check): the amber warning
  // callouts used pale amber-200 text on a 10% amber wash — in LIGHT
  // mode that is pale-on-pale and nearly illegible. The callout text
  // is now dark amber (amber-900) in light mode, keeping the pale
  // text only under `dark:`; headings and the privacy guest-mode
  // notice follow the same pattern. Legal wording unchanged.
  it('amber warning callouts meet contrast in light AND dark mode', () => {
    for (const page of ['src/app/terms/page.tsx', 'src/app/privacy/page.tsx']) {
      const src = read(page);
      // Warning box: dark text by default, pale text dark-only.
      expect(src, page).toContain('text-amber-900 dark:border-amber-500/20 dark:text-amber-200/90');
      // The old un-prefixed pale combo must not return.
      expect(src, page).not.toContain('border-amber-500/20 text-amber-200/90');
      // Warning heading + icon: amber-800 light / amber-400 dark.
      expect(src, page).toContain('text-amber-800 dark:text-amber-400');
      expect(src, page).not.toMatch(/font-bold text-amber-400 flex/);
    }
    // Privacy §1 guest-mode notice: same treatment.
    const privacy = read('src/app/privacy/page.tsx');
    expect(privacy).toContain('text-amber-800 dark:text-amber-300/80');
    expect(privacy).not.toContain('className="text-amber-300/80 pt-1"');
  });

  // Slop-audit next batch (WS2/WS3): the Disclaimer was missed by the
  // contrast pass above — its alert banner was amber-200 text on the
  // same 10% amber wash (yellow on pale yellow in light mode), and the
  // page imported nothing from lib/legal, so it carried no version.
  // The Privacy intro ("Guarantee") card had the same defect in
  // emerald. Both now follow the established pattern; the Disclaimer
  // also renders the shared legal version line like Terms/Privacy.
  it('disclaimer: alert banner + headings follow the amber callout pattern', () => {
    const src = read('src/app/disclaimer/page.tsx');
    expect(src).toContain('text-amber-900 dark:border-amber-500/20 dark:text-amber-200/90');
    expect(src).toContain('text-amber-800 dark:text-amber-400');
    // The old pale-on-pale combinations must not return.
    expect(src).not.toContain('border-amber-500/30 text-amber-200/90');
    expect(src).not.toContain('text-2xs text-amber-300/90');
    expect(src).not.toContain('font-bold text-amber-300"');
  });

  it('disclaimer: wired to the shared legal constants', () => {
    const src = read('src/app/disclaimer/page.tsx');
    expect(src).toContain("from '@/lib/legal'");
    expect(src).toContain('LEGAL_VERSION');
    expect(src).toContain('LEGAL_LAST_UPDATED');
  });

  it('privacy: guarantee card meets contrast in light AND dark mode', () => {
    const src = read('src/app/privacy/page.tsx');
    expect(src).toContain('text-emerald-900 dark:border-emerald-500/20 dark:text-emerald-200/90');
    expect(src).not.toContain('border-emerald-500/30 text-emerald-300');
  });
});
