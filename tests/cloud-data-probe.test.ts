/**
 * Task 2.2 (2026-11-05): the Task 1.4 merge-choice probe
 * (accountHasCloudData) had two silent-loss holes:
 *  1. It probed only profiles/workouts/meals — an account holding
 *     ONLY personal records, planned workouts, body metrics or coach
 *     blocks read as "no cloud data", so no merge choice was offered.
 *  2. It failed OPEN: any probe error (or an errored query, whose
 *     data is null) read as "no cloud data" and a plain merge ran
 *     over cloud data the probe never saw.
 * The verdict logic is now a pure exported helper
 * (resolveCloudDataProbe) that fails closed: a core-table error is
 * 'unknown', and the caller offers the choice — both choices keep
 * the data (merge, or archive-device-first), unlike a silent merge.
 * The optional coach_blocks table is probed tolerantly, matching
 * its pull path (the §16 table may not exist on a deployment).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveCloudDataProbe } from '../src/lib/supabase/sync';

const empty = { data: [], error: null };
const oneRow = { data: [{ id: 'x' }], error: null };
const boom = { data: null, error: new Error('network down') };

describe('resolveCloudDataProbe (Task 2.2)', () => {
  it('no rows anywhere → no-data', () => {
    expect(resolveCloudDataProbe([empty, empty, { data: null, error: null }])).toBe('no-data');
  });

  it('a row in any collection → has-data (array and single-row shapes)', () => {
    expect(resolveCloudDataProbe([empty, oneRow])).toBe('has-data');
    expect(resolveCloudDataProbe([empty, { data: { id: 'p' }, error: null }])).toBe('has-data');
  });

  it('a core-table error → unknown (fail closed), even with no rows elsewhere', () => {
    expect(resolveCloudDataProbe([empty, boom])).toBe('unknown');
    expect(resolveCloudDataProbe([oneRow, boom])).toBe('unknown');
  });

  it('a tolerated error (optional coach_blocks) never makes the verdict unknown', () => {
    expect(resolveCloudDataProbe([empty, { ...boom, tolerateError: true }])).toBe('no-data');
    expect(resolveCloudDataProbe([oneRow, { ...boom, tolerateError: true }])).toBe('has-data');
  });
});

describe('accountHasCloudData wiring (Task 2.2)', () => {
  const syncSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/supabase/sync.ts'),
    'utf8',
  );
  const method = syncSrc.slice(
    syncSrc.indexOf('accountHasCloudData'),
    syncSrc.indexOf('resetPasswordForEmail'),
  );

  it('probes every synced collection, not just profiles/workouts/meals', () => {
    for (const table of [
      'profiles',
      'workouts',
      'meals',
      'personal_records',
      'planned_workouts',
      'body_metrics',
      'coach_blocks',
    ]) {
      expect(method).toContain(`'${table}'`);
    }
    expect(method).toContain('resolveCloudDataProbe');
  });

  it('fails closed: a thrown probe returns true (offer the choice)', () => {
    expect(method).toMatch(/catch \{\s*\n\s*\/\/ Fail closed \(Task 2\.2\)[\s\S]*?return true;/);
  });
});
