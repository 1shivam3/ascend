// QA-hardening Phase 2, R14 — truncation leftovers. Two surfaces cut
// text badly:
//  (a) Plan cards: the name shared its row with the 5-button action
//      rail and used `truncate`, so long names were cut at the
//      buttons ("Muscle Blo..."). Per the brief, the name now owns
//      its row and wraps; the rail moved to its own row below.
//  (b) Exercise Library rows: the name shared a line with the
//      equipment/muscle chips. The name now takes the full row width
//      on its own line (wraps at word boundaries via break-words);
//      the chips moved to a wrapping row beneath it.
// Browser evidence: qa/e2e/r14-truncation.spec.ts (screenshots at
// 360x740 and 320x568, light + dark, with a seeded long plan name).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('R14 plan-card name owns its row', () => {
  const wp = read('src/components/WorkoutPage.tsx');
  const card = wp.slice(
    wp.indexOf('function PlanCard'),
    wp.indexOf('export default function WorkoutPage'),
  );

  it('the name wraps (break-words) and is not truncated anywhere in the card', () => {
    expect(card).toContain(
      '<h3 className="font-bold text-text-primary break-words leading-tight" title={plan.name}>',
    );
    expect(card).not.toContain('truncate');
  });

  it('the action rail is its own row, after the name, aligned right', () => {
    expect(card).toContain(
      '<div className="flex items-center justify-end gap-1 shrink-0 mt-2">',
    );
    expect(card.indexOf('{plan.name}')).toBeLessThan(
      card.indexOf("aria-label={t('plan.usePercent')}"),
    );
  });
});

describe('R14 exercise-library rows wrap at word boundaries', () => {
  const lib = read('src/components/ExerciseLibraryModal.tsx');

  it('the name renders on its own full-width line', () => {
    expect(lib).toContain(
      '<span className="block text-xs font-bold text-text-primary break-words font-sans">',
    );
  });

  it('the chips sit in a wrapping row AFTER the name, not beside it', () => {
    const nameIdx = lib.indexOf('{ex.name}');
    const equipIdx = lib.indexOf('{ex.equipment}');
    expect(nameIdx).toBeGreaterThan(-1);
    expect(equipIdx).toBeGreaterThan(nameIdx);
    const between = lib.slice(nameIdx, equipIdx);
    expect(between).toContain('flex items-center gap-2 flex-wrap');
  });

  it('no mid-word breaking utility anywhere in the modal', () => {
    expect(lib).not.toContain('break-all');
  });
});
