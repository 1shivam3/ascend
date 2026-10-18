import { describe, it, expect } from 'vitest';
import { getPurgeableLocalKeys, PRESERVED_LOCAL_KEYS } from '../src/lib/storage';

describe('Data reset purge (bug: "Delete WebApp Data & Reset" did not purge)', () => {
  it('removes the discrete legacy mirrors that used to resurrect deleted data', () => {
    const purgeable = getPurgeableLocalKeys([
      'ascend_store',
      'ascend_profile',
      'ascend_prs',
      'ascend_workouts',
      'ascend_meals',
      'ascend_emergency_snapshot',
      'ascend_active_tab',
      'ascend_active_draft',
      'ascend_ai_reports',
    ]);
    expect(purgeable).toEqual(
      expect.arrayContaining([
        'ascend_store',
        'ascend_profile',
        'ascend_prs',
        'ascend_workouts',
        'ascend_meals',
        'ascend_emergency_snapshot',
        'ascend_active_tab',
        'ascend_active_draft',
        'ascend_ai_reports',
      ])
    );
    expect(purgeable).toHaveLength(9);
  });

  it('preserves backend config, theme preference, and the session flag', () => {
    const purgeable = getPurgeableLocalKeys([
      'ascend_supabase_url',
      'ascend_supabase_anon_key',
      'ascend_theme',
      'ascend_has_custom_theme',
      'ascend_logged_out',
      'ascend_store',
    ]);
    expect(purgeable).toEqual(['ascend_store']);
    expect(PRESERVED_LOCAL_KEYS.has('ascend_supabase_url')).toBe(true);
    expect(PRESERVED_LOCAL_KEYS.has('ascend_theme')).toBe(true);
    expect(PRESERVED_LOCAL_KEYS.has('ascend_logged_out')).toBe(true);
  });

  it('ignores keys outside the ascend_ namespace', () => {
    expect(getPurgeableLocalKeys(['sb-auth-token', 'other_app_key'])).toEqual([]);
  });

  it('handles an empty key list', () => {
    expect(getPurgeableLocalKeys([])).toEqual([]);
  });
});
