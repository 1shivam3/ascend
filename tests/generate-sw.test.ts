import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// P0-2/D6: the SW generator must stamp a per-build cache name into
// public/sw.js. This test runs the real script against the real
// template, then restores the checked-in dev fallback afterwards.
const root = process.cwd();
const templatePath = path.join(root, 'public', 'sw.template.js');
const outPath = path.join(root, 'public', 'sw.js');

let originalSw: string;

function runGenerator(envOverrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  execFileSync('node', ['scripts/generate-sw.js'], { cwd: root, env, stdio: 'pipe' });
  return fs.readFileSync(outPath, 'utf8');
}

describe('generate-sw.js (P0-2/D6)', () => {
  beforeAll(() => {
    originalSw = fs.readFileSync(outPath, 'utf8');
    expect(fs.readFileSync(templatePath, 'utf8')).toContain('__ASCEND_CACHE_NAME__');
  });

  afterAll(() => {
    fs.writeFileSync(outPath, originalSw);
  });

  it('stamps the SHA cache name and leaves no placeholder', () => {
    const out = runGenerator({ VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' });
    expect(out).toContain('ascend-abcdef1-cache');
    expect(out).not.toContain('__ASCEND_CACHE_NAME__');
    // Fetch logic is untouched: same handlers as the template.
    expect(out).toContain('skipWaiting');
    expect(out).toContain('clients.claim');
    expect(out).toContain("startsWith('/api/')");
    expect(out).toContain('3000');
  });

  it('falls back to the dev name with no SHA env', () => {
    const out = runGenerator({
      VERCEL_GIT_COMMIT_SHA: undefined,
      NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: undefined,
    });
    expect(out).toContain('ascend-dev-cache');
    expect(out).not.toContain('__ASCEND_CACHE_NAME__');
  });

  it('accepts the NEXT_PUBLIC_ SHA variant', () => {
    const out = runGenerator({
      VERCEL_GIT_COMMIT_SHA: undefined,
      NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: '1234567fedcba',
    });
    expect(out).toContain('ascend-1234567-cache');
  });
});
