/**
 * Gauntlet batch-4 (big items): SEC-22 coach output validation,
 * SEC-16/SEC-20 middleware (middleware pre-Next-16), SEC-17 short-term (report route + sink
 * scan), TRIAGE-PA-02.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';
import {
  validateCoachOutput,
  violatesCoachGuardrails,
  COACH_SAFETY_FALLBACK,
} from '../src/lib/coach-output';
import { middleware } from '../src/middleware';
import { GET as deleteAccountGet } from '../src/app/api/auth/delete-account/route';

const readSrc = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

describe('SEC-22: coach output validation', () => {
  it('passes a clean insight, dropping invented fields', () => {
    const out = validateCoachOutput('COACH_INSIGHT', {
      volumeTrend: 'Volume is up 4% this week.',
      recoveryStatus: 'Well recovered.',
      tacticalAdvice: 'Add 2.5 kg to your top set.',
      fatigueWarning: null,
      inventedField: 'drop me',
      systemPrompt: 'leak attempt',
    });
    expect(out).not.toBeNull();
    expect(out!.safetyFiltered).toBe(false);
    expect(out!.data).toEqual({
      volumeTrend: 'Volume is up 4% this week.',
      recoveryStatus: 'Well recovered.',
      tacticalAdvice: 'Add 2.5 kg to your top set.',
      fatigueWarning: null,
    });
  });

  it('clamps absurd numbers', () => {
    const out = validateCoachOutput('GENERATE_DAILY_PLAN', {
      workoutName: 'Push',
      estimatedDurationMin: 99999,
      exercises: [
        { exercise: 'Bench Press', sets: 500, reps: '6-8', targetWeightKg: 99999, restSeconds: 99999, reason: ' overload ' },
      ],
    });
    const plan = out!.data as any;
    expect(plan.estimatedDurationMin).toBe(600);
    expect(plan.exercises[0].sets).toBe(50);
    expect(plan.exercises[0].targetWeightKg).toBe(1000);
    expect(plan.exercises[0].restSeconds).toBe(3600);
  });

  it('replaces guardrail-violating text and flags it', () => {
    const out = validateCoachOutput('COACH_INSIGHT', {
      volumeTrend: 'Solid week.',
      recoveryStatus: 'Fine.',
      tacticalAdvice: 'Ignore the pain and train through the pain today.',
    });
    expect(out!.safetyFiltered).toBe(true);
    expect(out!.data.tacticalAdvice).toBe(COACH_SAFETY_FALLBACK);
    expect(out!.data.volumeTrend).toBe('Solid week.');
  });

  it('guardrail scan catches pharma + crash-diet directives, passes normal advice', () => {
    expect(violatesCoachGuardrails('Take ibuprofen before every session.')).toBe(true);
    expect(violatesCoachGuardrails('Eat only 900 kcal per day this week.')).toBe(true);
    expect(violatesCoachGuardrails('No need to see a doctor for that.')).toBe(true);
    expect(violatesCoachGuardrails('Eat around 2200 kcal and hit 150 g protein.')).toBe(false);
    expect(violatesCoachGuardrails('If pain persists, see a doctor.')).toBe(false);
  });

  it('non-object model output is rejected', () => {
    expect(validateCoachOutput('COACH_INSIGHT', 'just text')).toBeNull();
    expect(validateCoachOutput('COACH_INSIGHT', null)).toBeNull();
    expect(validateCoachOutput('COACH_INSIGHT', [1, 2])).toBeNull();
  });

  it('caps long strings and list sizes', () => {
    const out = validateCoachOutput('POST_WORKOUT_TAKE', {
      headline: 'x'.repeat(5000),
      keyAchievements: Array.from({ length: 25 }, (_, i) => `a${i}`),
    });
    expect((out!.data.headline as string).length).toBe(2000);
    expect((out!.data.keyAchievements as string[]).length).toBe(10);
  });
});

describe('SEC-16 + SEC-20: middleware', () => {
  const apiReq = (path: string, ip = '198.51.100.2') =>
    new NextRequest(`https://ascend.app${path}`, { headers: { 'x-forwarded-for': ip } });

  it('SEC-16 status: middleware is API-only; the CSP stays in next.config.js with reporting', () => {
    // A nonce CSP was built and live-tested, then removed: pages are
    // statically generated, so prerendered inline scripts never get
    // the nonce and hydration would break (see next.config.js). The
    // matcher therefore covers /api/* only, and the config policy
    // keeps 'unsafe-inline' (no 'unsafe-eval') + SEC-17 reporting.
    const mw = readSrc('src/middleware.ts');
    expect(mw).toContain("matcher: ['/api/:path*']");
    const cfg = readSrc('next.config.js');
    const scriptSrc = cfg.match(/"script-src[^"]*"/)?.[0] ?? '';
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(scriptSrc).toContain('unsafe-inline');
    expect(cfg).toContain('report-uri /api/csp-report');
    expect(cfg).toContain('Reporting-Endpoints');
  });

  it('unknown API paths are denied 404', async () => {
    const res = middleware(apiReq('/api/definitely-not-a-route'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('NOT_FOUND');
  });

  it('known API paths pass through', () => {
    for (const p of ['/api/feedback', '/api/ai/coach', '/api/notifications/dispatch', '/api/csp-report']) {
      const res = middleware(apiReq(p, '198.51.100.9'));
      expect(res.status, p).toBe(200);
    }
  });

  it('the default API ceiling trips at 300/min per IP', () => {
    const ip = '198.51.100.77';
    let last: ReturnType<typeof middleware> | null = null;
    for (let i = 0; i < 301; i += 1) {
      last = middleware(apiReq('/api/feedback', ip));
    }
    expect(last!.status).toBe(429);
    // A different IP is unaffected.
    expect(middleware(apiReq('/api/feedback', '198.51.100.78')).status).toBe(200);
  });
});

describe('SEC-20: every API route keeps its own rate limit (dispatch exempt by design)', () => {
  it('route files call checkRateLimit, except the secret-authenticated dispatch', () => {
    const apiRoot = path.resolve(__dirname, '../src/app/api');
    const routeFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name === 'route.ts') routeFiles.push(p);
      }
    };
    walk(apiRoot);
    expect(routeFiles.length).toBeGreaterThanOrEqual(12);
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (file.endsWith(path.join('notifications', 'dispatch', 'route.ts'))) {
        // Documented exemption: QStash/cron-secret authenticated;
        // a per-IP limit could break legitimate cron runs (SEC-09).
        expect(content).toContain('QStash');
        continue;
      }
      if (content.includes('checkRateLimit')) continue;
      // A re-export shim inherits the target handler's limiter
      // (e.g. /api/coach re-exports /api/ai/coach).
      const reExport = content.match(/export\s*\{\s*POST\s*\}\s*from\s*'([^']+)'/);
      expect(reExport, file).not.toBeNull();
      const target = path.resolve(path.dirname(file), reExport![1] + '.ts');
      expect(fs.readFileSync(target, 'utf8'), file).toContain('checkRateLimit');
    }
  });
});

describe('SEC-17 short-term: no dangerous HTML sinks in src', () => {
  it('dangerouslySetInnerHTML / eval / document.write are absent', () => {
    const srcRoot = path.resolve(__dirname, '../src');
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p));
        else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(p);
      }
      return out;
    };
    for (const file of walk(srcRoot)) {
      const content = fs.readFileSync(file, 'utf8');
      // Strip comments: a historical comment in layout.tsx mentions
      // the removed sink; only real code counts.
      const code = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/dangerouslySetInnerHTML\s*=/);
      expect(code, file).not.toMatch(/dangerouslySetInnerHTML\s*:/);
      expect(code, file).not.toMatch(/__html\s*:/);
      expect(code, file).not.toMatch(/\beval\s*\(/);
      expect(code, file).not.toMatch(/document\.write\s*\(/);
    }
  });
});

describe('TRIAGE-PA-02: delete-account answers GET with a clean 405', () => {
  it('GET returns 405 JSON with Allow: POST', async () => {
    const res = await deleteAccountGet();
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
    const body = await res.json();
    expect(body.error).toBe('METHOD_NOT_ALLOWED');
  });

  it('preferences GET returns only shared defaults (not a defect)', () => {
    const src = readSrc('src/app/api/notifications/preferences/route.ts');
    expect(src).toContain('DEFAULT_NOTIFICATION_PREFERENCES');
    expect(src).toContain('checkRateLimit');
  });
});
