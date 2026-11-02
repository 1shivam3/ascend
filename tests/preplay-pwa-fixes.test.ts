import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Pre-play fixes D-PWA-1 / D-PWA-2 / D-PWA-5:
// - the generated public/sw.js must never be committed again (a stale
//   committed copy once shipped an old cache name without the SEC F-05
//   guard and would be bundled verbatim by a Capacitor build);
// - the template is the single source of the shipped worker and must
//   carry the cache-name + app-shell placeholders and the SEC F-05
//   same-origin guard;
// - the manifest's theme colours must match the HTML themeColor.
const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('pre-play PWA fixes (D-PWA-1/2/5)', () => {
  it('public/sw.js is git-ignored so it cannot be committed stale', () => {
    const gitignore = read('.gitignore');
    expect(gitignore).toMatch(/^\/public\/sw\.js$/m);
  });

  it('the SW template carries both generator placeholders', () => {
    const template = read('public/sw.template.js');
    expect(template).toContain('__ASCEND_CACHE_NAME__');
    expect(template).toContain('__APP_SHELL_ASSETS__');
  });

  it('the SW template keeps the SEC F-05 same-origin guard and clients.claim', () => {
    const template = read('public/sw.template.js');
    expect(template).toContain('url.origin !== self.location.origin');
    expect(template).toContain('clients.claim()');
    expect(template).toContain('skipWaiting()');
  });

  it('the generator injects build-output chunks into the precache (D-PWA-2)', () => {
    const generator = read('scripts/generate-sw.js');
    expect(generator).toContain('index.html');
    expect(generator).toContain('build-manifest.json');
    expect(generator).toContain('rootMainFiles');
  });

  it('package.json regenerates and asserts sw.js around the build', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.prebuild).toContain('generate-sw');
    expect(pkg.scripts.postbuild).toContain('generate-sw');
    expect(pkg.scripts.postbuild).toContain('assert-sw');
  });

  it('manifest theme colours match the HTML themeColor (D-PWA-5)', () => {
    const manifest = JSON.parse(read('public/manifest.json'));
    const layout = read('src/app/layout.tsx');
    const themeColor = /themeColor:\s*'(#[0-9a-fA-F]{6})'/.exec(layout)?.[1];
    expect(themeColor).toBeTruthy();
    expect(manifest.theme_color).toBe(themeColor);
    expect(manifest.background_color).toBe(themeColor);
  });
});
