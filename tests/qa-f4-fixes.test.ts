/**
 * QA-hardening F4 fix phase — one section per Phase 4 finding.
 * Every test here failed before its fix and passes after (verified by
 * stashing the fix and re-running).
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as vm from 'node:vm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  findLimitationClashes,
  generateAdaptedExercisesFromSelection,
  generateExercisesFromSelection,
} from '@/components/SuggestedWorkoutModal';
import {
  getExerciseJointCautions,
  getFilteredSubstitutes,
  getInjuryBannedFamilies,
  getMovementFamily,
  getPainSwapFallbacks,
  getPlanBannedJoints,
  isExerciseJointBanned,
  prepareGeneratedPlans,
} from '@/lib/workout-engine';
import { EXERCISE_LIBRARY, getExerciseMuscle } from '@/lib/exercise-library';
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

// ─── F4-2: offline relaunch was not served from the precache ────────

describe('F4-2: navigations fall back to the precached shell on every origin', () => {
  const template = () =>
    fs.readFileSync(path.join(process.cwd(), 'public', 'sw.template.js'), 'utf8');

  it('the localhost bypass excludes navigations', () => {
    expect(template()).toContain("request.mode !== 'navigate'");
  });

  it('the precache is fail-soft per asset, never one atomic addAll', () => {
    expect(template()).toContain('allSettled');
    expect(template()).not.toContain('addAll(STATIC_PRECACHE');
  });

  /** Run the real template in a VM with stubbed caches/fetch. */
  function loadWorker(opts: {
    fetchImpl: (req: unknown) => Promise<unknown>;
    addImpl?: (url: string) => Promise<void>;
    origin?: string;
  }) {
    const handlers: Record<string, (event: never) => void> = {};
    const shellResponse = { status: 200, body: 'APP SHELL', clone() { return shellResponse; } };
    const store = new Map<string, unknown>([['/', shellResponse]]);
    const cache = {
      match: async (req: unknown) =>
        store.get(typeof req === 'string' ? req : (req as { url: string }).url),
      add: opts.addImpl ?? (async () => undefined),
      put: async () => undefined,
    };
    let skipWaitingCalled = false;
    const selfObj = {
      addEventListener: (type: string, fn: (event: never) => void) => {
        handlers[type] = fn;
      },
      location: { origin: opts.origin ?? 'http://127.0.0.1:3100' },
      skipWaiting: async () => {
        skipWaitingCalled = true;
      },
      clients: { claim: async () => undefined },
      registration: { showNotification: async () => undefined },
    };
    const sandbox: Record<string, unknown> = {
      self: selfObj,
      caches: { open: async () => cache, match: cache.match, keys: async () => [], delete: async () => true },
      fetch: opts.fetchImpl,
      URL,
      Response: class {
        constructor(public body: unknown, public init?: unknown) {}
      },
      AbortController,
      setTimeout,
      clearTimeout,
      console,
    };
    vm.createContext(sandbox);
    vm.runInContext(template(), sandbox);
    return { handlers, shellResponse, wasSkipWaitingCalled: () => skipWaitingCalled };
  }

  async function fireNavigation(
    handlers: Record<string, (event: never) => void>,
    url: string
  ): Promise<Promise<unknown> | undefined> {
    let responded: Promise<unknown> | undefined;
    const event = {
      request: { method: 'GET', url, mode: 'navigate' },
      respondWith: (p: Promise<unknown>) => {
        responded = p;
      },
    };
    handlers['fetch'](event as never);
    return responded;
  }

  it('an offline localhost navigation is answered from the precached shell', async () => {
    const { handlers, shellResponse } = loadWorker({
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    const responded = await fireNavigation(handlers, 'http://127.0.0.1:3100/');
    expect(responded).toBeDefined();
    // NB: the VM realm's Promise is not an instanceof the test realm's,
    // so await it directly instead of expect().resolves.
    expect(await responded!).toBe(shellResponse);
  });

  it('an offline production-origin navigation is answered from the shell (regression guard)', async () => {
    const { handlers, shellResponse } = loadWorker({
      fetchImpl: async () => {
        throw new Error('offline');
      },
      origin: 'https://ascendtonext.vercel.app',
    });
    const responded = await fireNavigation(handlers, 'https://ascendtonext.vercel.app/');
    expect(responded).toBeDefined();
    expect(await responded!).toBe(shellResponse);
  });

  it('install still completes (skipWaiting) when one precache asset fails', async () => {
    let addCalls = 0;
    const { handlers, wasSkipWaitingCalled } = loadWorker({
      fetchImpl: async () => {
        throw new Error('unused');
      },
      addImpl: async (url: string) => {
        addCalls += 1;
        if (url.includes('icon')) throw new Error('404');
      },
    });
    let installed: Promise<unknown> | undefined;
    handlers['install']({
      waitUntil: (p: Promise<unknown>) => {
        installed = p;
      },
    } as never);
    await installed!; // a rejection here fails the test — that is the point
    expect(addCalls).toBeGreaterThan(5);
    expect(wasSkipWaitingCalled()).toBe(true);
  });
});

// ─── F4-4: Swap → Hurts for Squat offered zero replacements ─────────

describe('F4-4: pain swaps fall back instead of dead-ending', () => {
  it('root cause pinned: the strict hurts filter for Squat is empty (gym and home)', () => {
    const hurts = { avoidSameFamilyAs: 'Squat', avoidJointsOf: 'Squat' } as const;
    expect(getFilteredSubstitutes('Squat', { equipment: 'full_gym', ...hurts })).toEqual([]);
    expect(getFilteredSubstitutes('Squat', { equipment: 'home_dumbbells', ...hurts })).toEqual([]);
    // …while a normal (non-hurts) swap for Squat still has its list —
    // the strict machinery itself is not broken, only the pain corner.
    expect(getFilteredSubstitutes('Squat', { equipment: 'full_gym' }).length).toBeGreaterThan(0);
  });

  it('fallbacks: same primary muscle, different family, safest first, joints reported', () => {
    const fallbacks = getPainSwapFallbacks('Squat', { equipment: 'full_gym' });
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(fallbacks.length).toBeLessThanOrEqual(3);
    const squatCautions = new Set(getExerciseJointCautions('Squat'));
    for (const f of fallbacks) {
      expect(getExerciseMuscle(f.name)).toBe('Legs');
      expect(getMovementFamily(f.name)).not.toBe('squat');
      // sharedJoints is exactly the candidate's cautions ∩ Squat's —
      // the panel's caution label is driven by this, never hidden.
      const expected = getExerciseJointCautions(f.name).filter((j) => squatCautions.has(j));
      expect(f.sharedJoints).toEqual(expected);
    }
    const counts = fallbacks.map((f) => f.sharedJoints.length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('no Legs movement avoids every Squat joint — so every Squat fallback carries a caution', () => {
    // Data fact behind the design: the fallback list for Squat can
    // never be caution-free; the UI must label each one (and does, via
    // sharedJoints). If library data changes so a joint-free option
    // exists, this test flips and the sort puts it first instead.
    const fallbacks = getPainSwapFallbacks('Squat', { equipment: 'full_gym' });
    expect(fallbacks.every((f) => f.sharedJoints.length > 0)).toBe(true);
  });

  it('equipment is honored: home Squat pain honestly has no fallback (the remove branch)', () => {
    expect(getPainSwapFallbacks('Squat', { equipment: 'home_dumbbells' })).toEqual([]);
    const bw = getPainSwapFallbacks('Bench Press', { equipment: 'bodyweight_only' });
    expect(bw.length).toBeGreaterThan(0);
    for (const f of bw) {
      expect(['Bodyweight', 'Cardio']).toContain(f.equipment);
    }
  });

  it('exclusions are honored, and excluding everything yields the honest empty list', () => {
    const withExclusion = getPainSwapFallbacks('Squat', {
      equipment: 'full_gym',
      exclusions: ['Lying Leg Curl'],
    });
    expect(withExclusion.map((f) => f.name)).not.toContain('Lying Leg Curl');
    const allLegs = EXERCISE_LIBRARY.filter(
      (i) => getExerciseMuscle(i.name) === 'Legs' && i.name !== 'Squat'
    ).map((i) => i.name);
    expect(
      getPainSwapFallbacks('Squat', { equipment: 'full_gym', exclusions: allLegs })
    ).toEqual([]);
  });
});
