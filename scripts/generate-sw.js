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
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const templatePath = path.join(root, 'public', 'sw.template.js');
const outPath = path.join(root, 'public', 'sw.js');

const PLACEHOLDER = '__ASCEND_CACHE_NAME__';

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
  const out = template.split(PLACEHOLDER).join(cacheName);
  fs.writeFileSync(outPath, out);
  console.log(`[generate-sw] wrote ${outPath} with cache name ${cacheName}`);
}

main();
