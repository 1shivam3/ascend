import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// QA4 P3 (browser-verified on production 2026-10-21): on the Train tab
// at ~420px the plan card's action icons painted over the plan name —
// "Upper A" rendered as "Uppei A", "Lower B" as "Lowei B". PlanCard is
// not exported, so per the codebase's existing source-assertion pattern
// (data-recovery-and-barcode-qa.ts) this test pins the layout contract
// that makes overlap structurally impossible:
//   - header row is flex with a real gap,
//   - name block is flex-1 + min-w-0 (confined to leftover space),
//   - the title truncates inside its own box,
//   - the action rail is shrink-0 (never compressed into the name).
// Layout (not visual) verification: no browser is available in CI here.

const src = readFileSync(
  path.join(__dirname, '..', 'src', 'components', 'WorkoutPage.tsx'),
  'utf-8'
);

// Slice out just the PlanCard component so assertions can't be satisfied
// by unrelated markup elsewhere in this large file.
const planCardStart = src.indexOf('function PlanCard(');
const planCardEnd = src.indexOf('// ─── Main Component', planCardStart);
const planCard = src.slice(planCardStart, planCardEnd);

describe('PlanCard header layout contract (QA4 P3 icon/name overlap)', () => {
  it('finds the PlanCard component', () => {
    expect(planCardStart).toBeGreaterThan(-1);
    expect(planCardEnd).toBeGreaterThan(planCardStart);
    expect(planCard).toContain('{plan.name}');
  });

  it('header row is a flex row with a gap between name and actions', () => {
    expect(planCard).toMatch(/flex items-start justify-between gap-3/);
  });

  it('name block claims leftover space and can shrink below content size', () => {
    expect(planCard).toMatch(/className="flex-1 min-w-0 cursor-pointer"/);
  });

  it('title truncates inside its own box instead of line-clamping under the icons', () => {
    expect(planCard).toMatch(/<h3 className="[^"]*truncate[^"]*" title=\{plan\.name\}>/);
    expect(planCard).not.toContain('line-clamp-2');
  });

  it('action rail never shrinks', () => {
    expect(planCard).toMatch(/<div className="flex items-center gap-1 shrink-0">/);
  });
});
