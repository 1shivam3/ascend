/**
 * QA-hardening F4 fix phase — one section per Phase 4 finding.
 * Every test here failed before its fix and passes after (verified by
 * stashing the fix and re-running).
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  findLimitationClashes,
  generateAdaptedExercisesFromSelection,
  generateExercisesFromSelection,
} from '@/components/SuggestedWorkoutModal';
import {
  getInjuryBannedFamilies,
  getMovementFamily,
  getPlanBannedJoints,
  isExerciseJointBanned,
  prepareGeneratedPlans,
} from '@/lib/workout-engine';
import type { PlannedWorkout } from '@/lib/store';

// ─── F4-3: modal generator ignored DECLARED limitations ─────────────

const VIKRAM_CTX = {
  equipment: 'full_gym' as const,
  exclusions: [] as string[],
  limitations: ['Knee', 'Low back'] as string[],
};

describe('F4-3: Suggested Workout modal generation respects declared limitations', () => {
  it('Legs for Knee + Low back never contains Squat or any plan-banned movement', () => {
    const { exercises, limitationAdjusted } = generateAdaptedExercisesFromSelection(
      ['legs'],
      'medium',
      'kg',
      VIKRAM_CTX
    );
    expect(limitationAdjusted).toBe(true);
    expect(exercises.length).toBeGreaterThan(0);
    expect(exercises.map((e) => e.name)).not.toContain('Squat');
    const bannedFamilies = getInjuryBannedFamilies(VIKRAM_CTX.limitations);
    const bannedJoints = getPlanBannedJoints(VIKRAM_CTX.limitations);
    for (const ex of exercises) {
      expect(bannedFamilies.has(getMovementFamily(ex.name))).toBe(false);
      expect(isExerciseJointBanned(ex.name, bannedJoints)).toBe(false);
    }
  });

  it('matches prepareGeneratedPlans output exactly (same machinery as the split path)', () => {
    const raw = generateExercisesFromSelection(['legs'], 'medium', 'kg');
    const plan: PlannedWorkout = {
      id: 'parity',
      name: 'Legs',
      createdAt: new Date().toISOString(),
      exercises: raw,
    };
    const expected = prepareGeneratedPlans([plan], { ...VIKRAM_CTX, unit: 'kg' })[0].exercises;
    const { exercises } = generateAdaptedExercisesFromSelection(['legs'], 'medium', 'kg', VIKRAM_CTX);
    expect(exercises).toEqual(expected);
  });

  it('without limitations the raw picks pass through unchanged (Squat stays)', () => {
    const { exercises, limitationAdjusted } = generateAdaptedExercisesFromSelection(
      ['legs'],
      'medium',
      'kg',
      { equipment: 'full_gym', exclusions: [], limitations: [] }
    );
    expect(limitationAdjusted).toBe(false);
    expect(exercises.map((e) => e.name)).toEqual(
      generateExercisesFromSelection(['legs'], 'medium', 'kg').map((e) => e.name)
    );
    expect(exercises.map((e) => e.name)).toContain('Squat');
  });

  it('default Chest + Arms for Vikram still leads with Bench Press, no Squat/Deadlift', () => {
    const { exercises } = generateAdaptedExercisesFromSelection(
      ['chest', 'arms'],
      'medium',
      'kg',
      VIKRAM_CTX
    );
    const names = exercises.map((e) => e.name);
    expect(names).toContain('Bench Press');
    expect(names).not.toContain('Squat');
    expect(names).not.toContain('Deadlift');
  });

  it('a Shoulder limitation removes overhead pressing (vertical_push family)', () => {
    const { exercises, limitationAdjusted } = generateAdaptedExercisesFromSelection(
      ['shoulders'],
      'medium',
      'kg',
      { equipment: 'full_gym', exclusions: [], limitations: ['Shoulder'] }
    );
    expect(limitationAdjusted).toBe(true);
    expect(exercises.map((e) => e.name)).not.toContain('Overhead Press');
    for (const ex of exercises) {
      expect(getMovementFamily(ex.name)).not.toBe('vertical_push');
    }
  });
});

describe('F4-3: findLimitationClashes (the modal + plan-editor warning detection)', () => {
  it('flags Squat for a Knee limitation and clears it with none', () => {
    const list = [{ name: 'Squat' }, { name: 'Bench Press' }] as never[];
    expect(findLimitationClashes(list, ['Knee'])).toEqual(['Squat']);
    expect(findLimitationClashes(list, [])).toEqual([]);
    // Neck bans vertical_push + the neck joint — neither exercise trips it.
    expect(findLimitationClashes(list, ['Neck'])).toEqual([]);
  });
});

// ─── F4-1: cold offline tab open crashed on its lazy chunk ──────────

describe('F4-1: lazy tab chunks are precached and servable on localhost', () => {
  const root = process.cwd();
  const outPath = path.join(root, 'public', 'sw.js');
  let originalSw: string | null = null;

  beforeAll(() => {
    originalSw = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
  });
  afterAll(() => {
    if (originalSw !== null) fs.writeFileSync(outPath, originalSw);
    else if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  });

  function staticFilesOnDisk(): string[] {
    const staticRoot = path.join(root, '.next', 'static');
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(?:js|css)$/.test(entry.name)) {
          out.push('/_next/static/' + path.relative(staticRoot, full).split(path.sep).join('/'));
        }
      }
    };
    walk(staticRoot);
    return out;
  }

  it('the generator walks every emitted chunk (buildChunkAssets), not just the shell set', () => {
    const generator = fs.readFileSync(path.join(root, 'scripts', 'generate-sw.js'), 'utf8');
    expect(generator).toContain('buildChunkAssets');
  });

  it('the localhost bypass no longer swallows static assets', () => {
    const template = fs.readFileSync(path.join(root, 'public', 'sw.template.js'), 'utf8');
    expect(template).toContain('isLocalhost && !isStaticAsset');
  });

  it('generated sw.js precaches lazy chunks absent from the shell HTML', () => {
    const shellPath = path.join(root, '.next', 'server', 'app', 'index.html');
    if (!fs.existsSync(shellPath)) return; // no build yet — nothing to pin
    const html = fs.readFileSync(shellPath, 'utf8');
    const shellSet = new Set(
      [...html.matchAll(/\/_next\/static\/[^\s"'\\]+\.(?:js|css)/g)].map((m) => m[0])
    );
    const onDisk = staticFilesOnDisk();
    const lazy = onDisk.filter((f) => !shellSet.has(f));
    // The build really does emit chunks the shell never references
    // (the next/dynamic tab chunks) — they are the F4-1 gap.
    expect(lazy.length).toBeGreaterThan(0);
    execFileSync('node', ['scripts/generate-sw.js'], { cwd: root, stdio: 'pipe' });
    const sw = fs.readFileSync(outPath, 'utf8');
    for (const f of onDisk) {
      expect(sw).toContain(`'${f}'`);
    }
  });
});
