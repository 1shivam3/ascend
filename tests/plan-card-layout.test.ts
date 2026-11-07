import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// PlanCard header layout contract.
// History: QA4 P3 (browser-verified on production 2026-10-21) fixed the
// action icons PAINTING OVER the plan name ("Upper A" → "Uppei A") by
// confining the name to the leftover space beside a shrink-0 rail and
// truncating it. QA-hardening R14 (2026-11-07) supersedes that
// trade-off: truncation itself was the remaining complaint ("Muscle
// Blo..."), so the name now owns its row and WRAPS, and the action
// rail moved to its own row below. Overlap stays structurally
// impossible — name and rail no longer share a row at all.
// PlanCard is not exported, so per the codebase's existing
// source-assertion pattern this test pins the layout contract.
// Browser evidence for the new contract: qa/e2e/r14-truncation.spec.ts.

const src = readFileSync(
  path.join(__dirname, '..', 'src', 'components', 'WorkoutPage.tsx'),
  'utf-8'
);

// Slice out just the PlanCard component so assertions can't be satisfied
// by unrelated markup elsewhere in this large file.
const planCardStart = src.indexOf('function PlanCard(');
const planCardEnd = src.indexOf('// ─── Main Component', planCardStart);
const planCard = src.slice(planCardStart, planCardEnd);

describe('PlanCard header layout contract (R14, supersedes QA4 P3)', () => {
  it('finds the PlanCard component', () => {
    expect(planCardStart).toBeGreaterThan(-1);
    expect(planCardEnd).toBeGreaterThan(planCardStart);
    expect(planCard).toContain('{plan.name}');
  });

  it('name and actions no longer share a flex row', () => {
    expect(planCard).not.toMatch(/flex items-start justify-between gap-3/);
  });

  it('the name wraps at word boundaries instead of truncating', () => {
    expect(planCard).toMatch(
      /<h3 className="font-bold text-text-primary break-words leading-tight" title=\{plan\.name\}>/,
    );
    expect(planCard).not.toContain('truncate');
    expect(planCard).not.toContain('line-clamp-2');
  });

  it('the action rail is its own row below the name, aligned right, never shrunk', () => {
    expect(planCard).toMatch(
      /<div className="flex items-center justify-end gap-1 shrink-0 mt-2">/,
    );
    expect(planCard.indexOf('{plan.name}')).toBeLessThan(
      planCard.indexOf("aria-label={t('plan.usePercent')}"),
    );
  });
});
