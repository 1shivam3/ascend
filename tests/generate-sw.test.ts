import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// P0-2/D6: the SW generator must stamp a per-build cache name into
// public/sw.js. This test runs the real script against the real
// template, then restores the prior state afterwards.
// Pre-play D-PWA-1: public/sw.js is generated and git-ignored — on a
// fresh tree it may not exist yet; the restore step then removes the
// file the test generated instead of writing back a stale copy.
const root = process.cwd();
const templatePath = path.join(root, 'public', 'sw.template.js');
const outPath = path.join(root, 'public', 'sw.js');

let originalSw: string | null;

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
    originalSw = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
    expect(fs.readFileSync(templatePath, 'utf8')).toContain('__ASCEND_CACHE_NAME__');
  });

  afterAll(() => {
    if (originalSw !== null) fs.writeFileSync(outPath, originalSw);
    else if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
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

  it('leaves no app-shell assets placeholder (D-PWA-2)', () => {
    const out = runGenerator({});
    expect(out).not.toContain('__APP_SHELL_ASSETS__');
  });

  it('precaches the shell HTML’s JS/CSS assets when a build exists (D-PWA-2)', () => {
    const shellPath = path.join(root, '.next', 'server', 'app', 'index.html');
    if (!fs.existsSync(shellPath)) return; // no build yet — nothing to pin
    const html = fs.readFileSync(shellPath, 'utf8');
    const assets = new Set(
      [...html.matchAll(/\/_next\/static\/[^\s"'\\]+\.(?:js|css)/g)].map((m) => m[0]),
    );
    expect(assets.size).toBeGreaterThan(0);
    const out = runGenerator({});
    for (const a of assets) {
      expect(out).toContain(`'${a}'`);
    }
  });
});
