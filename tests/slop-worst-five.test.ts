import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  generateDeterministicPostWorkoutTake,
} from '../src/lib/ai-coach';
import { ALL_QUOTES, getDailyQuote } from '../src/lib/quotes';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';
import { LEGAL_VERSION, LEGAL_LAST_UPDATED } from '../src/lib/legal';

// ── Slop-audit worst-five fixes (2026-11-02) ────────────────────────────────
// Fix 1: deterministic coach fallbacks may only state values actually
// computed from the user's data — no fabricated physiology, no invented
// numbers. Fix 2: local edits are never labelled "AI". Fix 3: README /
// Terms truth. Fix 4: curated quotes + one daily-quote source. Fix 5:
// dead code removed (deletions verified by tsc + this suite passing).

const BANNED_PHRASES = [
  'intra-muscular',
  'pump',
  'stimulus successfully delivered',
  'disciplined set execution',
  'maintained load progression',
  'Intracellular',
  'work capacity',
  'with good energy',
  'CNS and muscular recovery',
];

function expectNoBannedPhrases(text: string) {
  for (const phrase of BANNED_PHRASES) {
    expect(text, `fallback output must not contain "${phrase}"`).not.toContain(phrase);
  }
}

const doneSet = (weight: number, reps: number) => ({ weight, reps, status: 'completed' as const });

describe('Fix 1 — honest post-workout take fallback', () => {
  it('reports this session\'s measured volume instead of a canned claim', () => {
    const take = generateDeterministicPostWorkoutTake({
      exercises: [{ name: 'Bench Press', sets: [doneSet(60, 10)] }],
    } as any);
    expect(take.volumeVsLastWeek).toContain('600 kg');
    expect(take.volumeVsLastWeek).toContain('1 completed sets');
    expectNoBannedPhrases([take.volumeVsLastWeek, ...take.keyAchievements, take.headline].join('\n'));
  });

  it('makes NO duration claim when the workout has no recorded duration', () => {
    const take = generateDeterministicPostWorkoutTake({
      exercises: [{ name: 'Bench Press', sets: [doneSet(60, 10)] }],
    } as any);
    const joined = take.keyAchievements.join('\n');
    expect(joined).not.toContain('Session duration');
    expect(joined).not.toContain('45 minutes');
  });

  it('states the real duration when one was recorded', () => {
    const take = generateDeterministicPostWorkoutTake({
      durationMinutes: 32,
      exercises: [{ name: 'Bench Press', sets: [doneSet(60, 10)] }],
    } as any);
    expect(take.keyAchievements.join('\n')).toContain('Session duration: 32 minutes.');
  });

  it('says plainly when nothing was recorded', () => {
    const take = generateDeterministicPostWorkoutTake({ exercises: [] } as any);
    expect(take.keyAchievements.join('\n')).toContain('No completed sets were recorded');
    expect(take.volumeVsLastWeek).toContain('No weighted sets were recorded');
  });
});

describe('Fix 1 — prompt schema and digest sentence join', () => {
  // Slop-tail note: the weekly-review and daily-insight deterministic
  // generators pinned here in PR #72 turned out to be unreachable (zero
  // production callers — their only would-be callers were archived
  // components). Both generators and their pins were removed in the
  // slop-tail pass; the live post-workout take keeps its honesty pins
  // in the describe above.
  afterEach(() => {
    vi.useRealTimers();
  });

  
  
  it('COACH_INSIGHT schema no longer seeds CNS jargon', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/ai/coach/route.ts'), 'utf-8');
    expect(route).not.toContain('CNS and muscular recovery');
    expect(route).not.toContain('high-leverage');
  });

  it('comma splice in the hold-missed digest line is a proper sentence join', () => {
    const enDict = en as Record<string, string>;
    expect(enDict['coachDigest.adjHoldMissed']).toContain('Some reps were missed. The load is in the right zone');
    expect(enDict['coachDigest.adjHoldMissed']).not.toContain('missed, The');
    const engine = fs.readFileSync(path.join(process.cwd(), 'src/lib/coach-engine.ts'), 'utf-8');
    expect(engine).not.toContain("were missed,'");
  });
});

describe('Fix 2 — the local meal refine is never labelled "AI Adjusted"', () => {
  it('the dead AI-Adjusted keys are gone from both locales', () => {
    const enDict = en as Record<string, string | undefined>;
    const hiDict = hi as Record<string, string | undefined>;
    expect(enDict['scan.aiAdjustedTitle']).toBeUndefined();
    expect(enDict['scan.aiAdjustedMsg']).toBeUndefined();
    expect(hiDict['scan.aiAdjustedTitle']).toBeUndefined();
    expect(hiDict['scan.aiAdjustedMsg']).toBeUndefined();
  });

  it('the honest offline label + local-adjust message exist in both locales', () => {
    const enDict = en as Record<string, string | undefined>;
    const hiDict = hi as Record<string, string | undefined>;
    expect(enDict['scan.offlineAdjustTitle']).toBe('Offline Adjust');
    expect(enDict['scan.localAdjustMsg']).toBe('Portions updated based on your feedback.');
    expect(hiDict['scan.offlineAdjustTitle']).toBeTruthy();
    expect(hiDict['scan.localAdjustMsg']).toBeTruthy();
  });

  it('ScanMealModal wires the local path to the offline label', () => {
    const modal = fs.readFileSync(path.join(process.cwd(), 'src/components/ScanMealModal.tsx'), 'utf-8');
    expect(modal).toContain("t('scan.offlineAdjustTitle')");
    expect(modal).toContain("t('scan.localAdjustMsg')");
    expect(modal).not.toContain('aiAdjusted');
  });
});

describe('Fix 3 — README and Terms tell the truth', () => {
  it('README carries none of the retracted claims', () => {
    const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf-8');
    expect(readme).not.toContain('✨ AI Generated');
    expect(readme).not.toContain('zero cloud tracking');
    expect(readme).not.toContain('100% local-first');
    expect(readme).not.toContain('Next.js 14');
    expect(readme).not.toContain('React 18');
    expect(readme).not.toContain('App Store Compliance');
    expect(readme).not.toContain('personal free Gemini API key');
    expect(readme).toContain('Groq → OpenRouter → Gemini');
  });

  it('Terms summary no longer claims 100% local storage', () => {
    const terms = fs.readFileSync(path.join(process.cwd(), 'src/app/terms/page.tsx'), 'utf-8');
    expect(terms).not.toContain('stored 100% locally');
    expect(terms).toContain('stored locally on your device by default');
  });

  it('legal version was bumped with the change', () => {
    expect(LEGAL_VERSION).toBe('2.8');
    expect(LEGAL_LAST_UPDATED).toBe('November 2, 2026');
  });
});

describe('Fix 4 — curated quotes dataset', () => {
  it('has a curated size (16–32 quotes)', () => {
    expect(ALL_QUOTES.length).toBeGreaterThanOrEqual(16);
    expect(ALL_QUOTES.length).toBeLessThanOrEqual(32);
  });

  it('every quote has a real, non-empty attribution — no Unknown, no fictional characters', () => {
    for (const q of ALL_QUOTES) {
      expect(q.author.trim().length).toBeGreaterThan(0);
      expect(q.author.trim().toLowerCase()).not.toBe('unknown');
      expect(q.author).not.toContain('Rocky');
      expect(q.author).not.toContain('Balboa');
      expect(q.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate quote texts', () => {
    const seen = new Set<string>();
    for (const q of ALL_QUOTES) {
      const key = q.text.trim().toLowerCase().replace(/\s+/g, ' ');
      expect(seen.has(key), `duplicate quote: ${q.text}`).toBe(false);
      seen.add(key);
    }
  });

  it('Serena Williams quotes live in the female list, not the male list', () => {
    for (const q of ALL_QUOTES.filter((x) => x.author === 'Serena Williams')) {
      expect(q.gender).toBe('female');
    }
  });

  it('the selector only ever returns curated quotes, for every gender', () => {
    const texts = new Set(ALL_QUOTES.map((q) => q.text));
    for (const g of ['male', 'female', 'other', null] as const) {
      for (let offset = 0; offset < 40; offset++) {
        expect(texts.has(getDailyQuote(g, 4, offset).text)).toBe(true);
      }
    }
  });

  it('every surface reads the one daily-quote selector (HomePage only)', () => {
    const home = fs.readFileSync(path.join(process.cwd(), 'src/components/HomePage.tsx'), 'utf-8');
    // Exactly one selection call site in the app.
    expect(home.match(/getDailyQuote\(/g)).toHaveLength(1);
    // No other component or page imports the quotes module.
    const roots = ['src/components', 'src/app'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const content = fs.readFileSync(p, 'utf-8');
          if (content.includes('lib/quotes') && !p.endsWith('HomePage.tsx')) offenders.push(p);
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});

describe('Fix 5 — dead capability modules stay deleted', () => {
  it('scan-bridge.ts and food-meta.ts do not exist and nothing references them', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'src/lib/scan-bridge.ts'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), 'src/lib/food-meta.ts'))).toBe(false);
    const types = fs.readFileSync(path.join(process.cwd(), 'src/lib/types.ts'), 'utf-8');
    expect(types).not.toContain('food-meta.ts');
    expect(types).not.toContain('FOOD_META');
  });
});
