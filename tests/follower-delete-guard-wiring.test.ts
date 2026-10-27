import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Audit F19 wiring test (source-level, following the precedent of
 * generate-sw.test.ts / i18n.test.ts / modal-a11y.test.ts): every
 * delete handler must consult ensureDeleteWillPersist before deleting
 * and must surface the guard-failure toast. The guard's own behavior
 * (leader/follower resolution) is covered by follower-delete-persist
 * tests; this test pins the WIRING so a future delete site cannot
 * silently bypass it.
 *
 * LIMIT: this asserts the wiring exists, not the live multi-tab
 * behavior — that still needs the browser-check list.
 */

function src(rel: string): string {
  return readFileSync(join(process.cwd(), 'src', rel), 'utf8');
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('F19: follower-tab delete guard wiring', () => {
  it('MealsPage meal delete consults the guard', () => {
    const s = src('components/MealsPage.tsx');
    expect(s).toContain("from '@/lib/delete-persist-guard'");
    expect(count(s, 'await ensureDeleteWillPersist()')).toBeGreaterThanOrEqual(1);
    expect(s).toContain("t('toast.deleteNotSaved')");
  });

  it('MealsPage guards food-item, custom-suggestion, and pinned deletes (Cycle B)', () => {
    const s = src('components/MealsPage.tsx');
    // F19 meal delete + B1 food-with-undo + custom-suggestion + pinned + clear-all.
    expect(count(s, 'await ensureDeleteWillPersist()')).toBeGreaterThanOrEqual(5);
    expect(s).toContain('handleDeleteFoodWithUndo');
    expect(s).toContain('handleDeleteCustomSuggestion');
    expect(s).toContain('handleDeletePinned');
    expect(s).toContain('handleClearAllPinned');
  });

  it('DataVaultModal guards both reset paths (Cycle B)', () => {
    const s = src('components/DataVaultModal.tsx');
    expect(s).toContain("from '@/lib/delete-persist-guard'");
    expect(count(s, 'await ensureDeleteWillPersist()')).toBeGreaterThanOrEqual(2);
    expect(s).toContain("t('toast.deleteNotSaved')");
  });

  it('SettingsView guards logout+wipe (Cycle B)', () => {
    const s = src('components/SettingsView.tsx');
    expect(s).toContain("from '@/lib/delete-persist-guard'");
    expect(count(s, 'await ensureDeleteWillPersist()')).toBeGreaterThanOrEqual(1);
    expect(s).toContain("t('toast.deleteNotSaved')");
  });

  it('PRsPage routes all PR deletes through one guarded handler', () => {
    const s = src('components/PRsPage.tsx');
    expect(s).toContain("from '@/lib/delete-persist-guard'");
    expect(count(s, 'await ensureDeleteWillPersist()')).toBeGreaterThanOrEqual(1);
    expect(count(s, 'onDeletePR={handleDeletePR}')).toBe(4);
    expect(s).toContain("t('toast.deleteNotSaved')");
  });

  it('WorkoutPage guards both workout and plan deletes', () => {
    const s = src('components/WorkoutPage.tsx');
    expect(s).toContain("from '@/lib/delete-persist-guard'");
    // Pre-existing workout delete + the new plan delete.
    expect(count(s, 'await ensureDeleteWillPersist()')).toBeGreaterThanOrEqual(2);
    expect(s).toContain("t('toast.deleteNotSaved')");
  });

  it('BodyMetricsModal metric delete consults the guard', () => {
    const s = src('components/BodyMetricsModal.tsx');
    expect(s).toContain("from '@/lib/delete-persist-guard'");
    expect(count(s, 'await ensureDeleteWillPersist()')).toBeGreaterThanOrEqual(1);
    expect(s).toContain("t('toast.deleteNotSaved')");
  });

  it('guard-failure copy is generic (no entity name) in both locales', () => {
    const en = src('lib/i18n/en.ts');
    const hi = src('lib/i18n/hi.ts');
    expect(en).toContain('nothing was deleted');
    expect(en).not.toContain('the workout was not deleted');
    expect(hi).toContain('कुछ हटाया नहीं गया');
    expect(hi).not.toContain('वर्कआउट हटाया नहीं गया');
  });
});
