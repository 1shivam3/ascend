/**
 * UI/UX audit Phase 3 — Task 3.1 (P1-2, P2-4): clipped/truncated text.
 *
 * Essential user-facing text (exercise names, food names, meal titles,
 * plan names, option labels) must wrap — never single-line ellipsis.
 * These pins lock the layout contracts:
 *  - Generator exercise rows are two-line: name on line 1 (wraps),
 *    Sets/Reps steppers on line 2; the plan-name field is full width.
 *  - Generator selectors (body parts, intensity, split cards) show
 *    full sub-labels; the RPE/effort picker cards show full labels
 *    and descriptions.
 *  - Meal titles and food names in the meal log wrap.
 *  - Today quick-action labels wrap inside their cards.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

function lineWith(src: string, marker: string): string {
  const line = src.split('\n').find((l) => l.includes(marker));
  expect(line, `marker not found: ${marker}`).toBeTruthy();
  return line!;
}

describe('P1-2 generator (SuggestedWorkoutModal)', () => {
  const src = read('src/components/SuggestedWorkoutModal.tsx');

  it('exercise row name wraps on its own line (no truncate)', () => {
    const line = lineWith(src, 'flex-1 min-w-0 leading-snug break-words');
    expect(line).not.toContain('truncate');
    expect(src).toContain('pl-7'); // steppers moved to the second line
  });

  it('plan-name field is full width on its own line', () => {
    const line = lineWith(src, 'value={planTitle}');
    expect(src).toContain('w-full font-bold text-sm');
    expect(line).toBeDefined();
  });

  it('intensity sub-labels are not truncated', () => {
    const line = lineWith(src, 't(int.tagKey)');
    expect(line).not.toContain('truncate');
  });

  it('body-part labels and descriptions wrap; the selected check stays in flow', () => {
    expect(lineWith(src, 't(bp.labelKey)')).not.toContain('truncate');
    expect(lineWith(src, 't(bp.descKey)')).not.toContain('truncate');
    expect(src).toContain('<Check className="w-3.5 h-3.5 text-accent shrink-0" />');
  });

  it('split card descriptions get two lines', () => {
    expect(src).toContain('text-2xs text-text-muted line-clamp-2 mt-0.5');
  });
});

describe('P1-2 meal log (MealsPage)', () => {
  const src = read('src/components/MealsPage.tsx');

  it('meal titles wrap in Today and History (title tooltip kept)', () => {
    const h3 = lineWith(src, '<h3 className="font-bold text-xs sm:text-sm');
    const h4 = lineWith(src, '<h4 className="font-bold text-xs');
    for (const l of [h3, h4]) {
      expect(l).not.toContain('truncate');
      expect(l).toContain('title={displayMealName(meal.name)}');
    }
  });

  it('expanded food names wrap (title tooltip kept)', () => {
    const lines = src.split('\n').filter((l) => l.includes('title={food.name}'));
    expect(lines.length).toBe(2);
    for (const l of lines) {
      expect(l).not.toContain('truncate');
      expect(l).toContain('break-words');
    }
  });

  it('favorite food names wrap', () => {
    expect(lineWith(src, 'title={fav.name}')).not.toContain('truncate');
  });
});

describe('P2-4 Today quick actions (HomePage)', () => {
  const src = read('src/components/HomePage.tsx');

  it('all four quick-action labels wrap instead of truncating', () => {
    for (const key of ['home.mealScan', 'home.scan', 'home.weight', 'home.formCheck']) {
      const line = lineWith(src, `t('${key}')`);
      expect(line, key).not.toContain('truncate');
      expect(line, key).toContain('break-words');
    }
  });
});

describe('P1-2 active workout + effort picker (ActiveWorkoutScreen)', () => {
  const src = read('src/components/ActiveWorkoutScreen.tsx');

  it('RPE picker cards show full label and description (no truncate)', () => {
    expect(lineWith(src, 't(item.labelKey as StringKey)')).not.toContain('truncate');
    expect(lineWith(src, 't(item.descKey as StringKey)')).not.toContain('truncate');
  });

  it('warm-up set labels are not width-capped', () => {
    const line = lineWith(src, '{w.label}');
    expect(line).not.toContain('truncate');
    expect(line).not.toContain('max-w-[130px]');
  });

  it('the big current-exercise heading wraps', () => {
    const line = lineWith(src, 'text-3xl sm:text-4xl');
    expect(line).not.toContain('truncate');
    expect(line).toContain('break-words');
  });
});
