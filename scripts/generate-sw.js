// Generates public/sw.js from public/sw.template.js with a per-build
// cache name.
//
// P0-2/D6: the old sw.js hardcoded CACHE_NAME ('ascend-v2.0.0-cache'),
// so its bytes never changed between deploys and the browser never
// installed a new worker — the old worker kept serving the old cached
// shell (notably via the 3s navigation-race fallback on slow
// connections). A versioned name makes every deploy change sw.js bytes,
// so the browser installs the new worker, which skipWaits, purges the
// old caches, and claims clients (all already in the template).
//
// The SHA comes from Vercel's build-time env (VERCEL_GIT_COMMIT_SHA);
// without one (local dev) the fallback name keeps dev behavior stable.
// No dependencies; safe to run under `npm run build` via `prebuild`.
//
// Pre-play D-PWA-1: public/sw.js is intentionally NOT committed — this
// script is the single source of the shipped worker, run by `prebuild`
// before every `next build`, and scripts/assert-sw.js (postbuild)
// verifies the generated file. A committed copy went stale once
// (hard-coded old cache name, missing the SEC F-05 same-origin guard)
// and would have been bundled verbatim by a Capacitor build
// (webDir: 'public').
//
// Pre-play D-PWA-2: the precache list also embeds the current build's
// critical JS/CSS chunks, read from .next/build-manifest.json and
// .next/app-build-manifest.json. This script runs twice per build:
// `prebuild` (a valid sw.js exists before `next build` starts; chunk
// list comes from any previous build output) and `postbuild` (chunk
// list regenerated from the build that just finished, so the shipped
// worker precaches exactly this deploy's shell chunks). Chunk URLs
// are content-hashed; install precache is fail-soft and the runtime
// stale-while-revalidate branch covers any chunk not precached.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const templatePath = path.join(root, 'public', 'sw.template.js');
const outPath = path.join(root, 'public', 'sw.js');

const PLACEHOLDER = '__ASCEND_CACHE_NAME__';
const ASSETS_PLACEHOLDER = "'__APP_SHELL_ASSETS__'";

/**
 * Every JS/CSS chunk the build emitted under .next/static (URLs of the
 * form /_next/static/...). F4-1: the shell-HTML set alone misses the
 * lazily loaded tab chunks (Train, Fuel, Progress, You, Settings are
 * next/dynamic imports — nothing in index.html references them), so a
 * first-ever offline open of a tab had no chunk to load and crashed
 * into the error boundary. Precaching the whole static output costs
 * ~4.5 MB on current builds (measured .next/static JS+CSS total) —
 * acceptable for an offline-first app whose core promise is training
 * with no connection. Returns [] when no build output exists yet.
 */
function buildChunkAssets() {
  const files = new Set();
  const staticRoot = path.join(root, '.next', 'static');
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; /* no build output yet */
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(?:js|css)$/.test(entry.name)) {
        const rel = path.relative(staticRoot, full).split(path.sep).join('/');
        files.add('/_next/static/' + rel);
      }
    }
  };
  walk(staticRoot);
  return [...files];
}

/**
 * Critical app-shell JS/CSS for the current build. Ground truth is the
 * prerendered shell HTML (.next/server/app/index.html): every
 * /_next/static/*.js|css URL it references is required to render `/`
 * offline. Fallback: build-manifest rootMainFiles (+ /_app). The set
 * is then UNIONED with every chunk the build emitted (buildChunkAssets,
 * F4-1) so lazy tab chunks are precached too. Returns [] when no build
 * output exists yet (first-ever build).
 */
function appShellAssets() {
  const files = new Set();
  try {
    const html = fs.readFileSync(
      path.join(root, '.next', 'server', 'app', 'index.html'),
      'utf8',
    );
    for (const m of html.matchAll(/\/_next\/static\/[^\s"'\\]+\.(?:js|css)/g)) {
      files.add(m[0]);
    }
  } catch {
    /* shell HTML absent — fall through to the manifest */
  }
  if (files.size === 0) {
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(root, '.next', 'build-manifest.json'), 'utf8'),
      );
      const list = [
        ...(manifest.rootMainFiles || []),
        ...((manifest.pages && manifest.pages['/_app']) || []),
      ];
      for (const f of list) {
        if (typeof f === 'string' && (f.endsWith('.js') || f.endsWith('.css'))) {
          files.add('/_next/' + f.replace(/^\/?/, ''));
        }
      }
    } catch {
      /* manifest absent — precache stays shell-only */
    }
  }
  // F4-1: union in every emitted chunk (lazy tabs included), sorted
  // for a deterministic precache list.
  for (const f of buildChunkAssets()) files.add(f);
  return [...files].sort();
}

function main() {
  const sha = (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    'dev'
  ).slice(0, 7);
  const cacheName = `ascend-${sha}-cache`;

  const template = fs.readFileSync(templatePath, 'utf8');
  if (!template.includes(PLACEHOLDER)) {
    console.error(`[generate-sw] template ${templatePath} is missing the ${PLACEHOLDER} placeholder — refusing to write a stale sw.js`);
    process.exit(1);
  }
  if (!template.includes(ASSETS_PLACEHOLDER)) {
    console.error(`[generate-sw] template ${templatePath} is missing the ${ASSETS_PLACEHOLDER} placeholder — refusing to write sw.js without the app-shell precache slot`);
    process.exit(1);
  }
  const assets = appShellAssets();
  const assetLines = assets.map((a) => `  '${a}',`).join('\n');
  const out = template
    .split(PLACEHOLDER)
    .join(cacheName)
    .split(ASSETS_PLACEHOLDER)
    .join(assetLines || '');
  fs.writeFileSync(outPath, out);
  console.log(`[generate-sw] wrote ${outPath} with cache name ${cacheName} and ${assets.length} app-shell assets`);
}

main();
