import { describe, it, expect } from 'vitest';
import { bodyMetricRowForPush, bodyMetricFromRemoteRow } from '../src/lib/supabase/sync';
import type { BodyMetricEntry } from '../src/lib/types';

/**
 * Gauntlet DI-02 regression: body-fat / chest / waist / hips were
 * dropped by the sync push AND pull (no such columns, no such fields
 * in the mappings) while CSV export included them — measurements
 * tracked on one device vanished on the next.
 */
describe('gauntlet DI-02: body-metric measurement sync mappings', () => {
  const entry: BodyMetricEntry = {
    id: 'bm-1',
    date: '2026-10-20',
    weightKg: 80,
    heightCm: 175,
    bodyFatPct: 18.5,
    chestIn: 42,
    waistIn: 33.5,
    hipsIn: 40,
    notes: 'morning',
  };

  it('push rows carry all four measurement columns', () => {
    const row = bodyMetricRowForPush(entry, 'user-1');
    expect(row.body_fat_pct).toBe(18.5);
    expect(row.chest_in).toBe(42);
    expect(row.waist_in).toBe(33.5);
    expect(row.hips_in).toBe(40);
    expect(row.weight_kg).toBe(80);
    expect(row.user_id).toBe('user-1');
  });

  it('push rows null the measurements when absent (no undefined leaks)', () => {
    const row = bodyMetricRowForPush({ id: 'bm-2', date: '2026-10-20', weightKg: 80 }, 'user-1');
    expect(row.body_fat_pct).toBeNull();
    expect(row.chest_in).toBeNull();
    expect(row.waist_in).toBeNull();
    expect(row.hips_in).toBeNull();
  });

  it('pull rows restore all four measurements', () => {
    const restored = bodyMetricFromRemoteRow({
      id: 'bm-1',
      date: '2026-10-20',
      weight_kg: 80,
      height_cm: 175,
      body_fat_pct: 18.5,
      chest_in: 42,
      waist_in: 33.5,
      hips_in: 40,
      notes: 'morning',
    });
    expect(restored).toEqual(entry);
  });

  it('pull rows tolerate pre-migration rows without the columns', () => {
    const restored = bodyMetricFromRemoteRow({
      id: 'bm-3',
      date: '2026-10-20',
      weight_kg: 80,
    });
    expect(restored.bodyFatPct).toBeUndefined();
    expect(restored.chestIn).toBeUndefined();
    expect(restored.waistIn).toBeUndefined();
    expect(restored.hipsIn).toBeUndefined();
    expect(restored.weightKg).toBe(80);
  });

  it('push → pull round-trips the measurements', () => {
    const row = bodyMetricRowForPush(entry, 'user-1');
    const restored = bodyMetricFromRemoteRow({
      ...row,
      weight_kg: row.weight_kg,
      height_cm: row.height_cm,
    });
    expect(restored.bodyFatPct).toBe(18.5);
    expect(restored.chestIn).toBe(42);
    expect(restored.waistIn).toBe(33.5);
    expect(restored.hipsIn).toBe(40);
  });
});
