// QA-hardening Phase 2, R15 — Train header icon buttons.
// The Train header has exactly two icon-only buttons: Plate
// Calculator (advanced mode only) and Training Tools. Audit Phase 5
// had already labelled both; R15 VERIFIES that state and pins it so
// it cannot silently regress:
//  - each button carries BOTH an aria-label (accessible name) and a
//    title (visible tooltip affordance), from the same i18n key;
//  - the two labels are distinct and name their actual function;
//  - the buttons keep a 44px touch target (w-11 h-11);
//  - the Hindi tools.title actually says "Training Tools" — it
//    previously read 'ट्रेनिंग देखें' ("view training"), which R15
//    corrected (machine translation, flagged in hi.ts).
// Browser evidence: qa/e2e/r15-train-header.spec.ts (advanced mode,
// both buttons located by accessible name, screenshots 360x740
// light + dark).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const wp = read('src/components/WorkoutPage.tsx');
const header = wp.slice(
  wp.indexOf('Screen 10 Header'),
  wp.indexOf('</header>'),
);
const en = read('src/lib/i18n/en.ts');
const hi = read('src/lib/i18n/hi.ts');

describe('R15 Train header icon buttons are labelled', () => {
  it('plate calculator button: title + aria-label from tools.plateTitle', () => {
    expect(header).toContain("title={t('tools.plateTitle')}");
    expect(header).toContain("aria-label={t('tools.plateTitle')}");
  });

  it('training tools button: title + aria-label from tools.title', () => {
    expect(header).toContain("title={t('tools.title')}");
    expect(header).toContain("aria-label={t('tools.title')}");
  });

  it('both buttons keep a 44px target and a bordered circular affordance', () => {
    const buttons = header.match(/w-11 h-11 rounded-full/g) ?? [];
    expect(buttons.length).toBe(2);
  });

  it('the two labels are distinct and name their functions (en)', () => {
    expect(en).toContain("'tools.title': 'Training Tools'");
    expect(en).toContain("'tools.plateTitle': 'Plate Calculator'");
  });

  it('the Hindi tools title says Training Tools, not "view training"', () => {
    expect(hi).toContain("'tools.title': 'ट्रेनिंग टूल्स'");
    expect(hi).not.toContain("'tools.title': 'ट्रेनिंग देखें'");
    expect(hi).toContain("'tools.plateTitle': 'प्लेट कैलकुलेटर'");
  });
});
