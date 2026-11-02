// Post-build assertion for the generated service worker (pre-play
// D-PWA-1/D-PWA-2). public/sw.js is generated, never committed; this
// check runs via `postbuild` after scripts/generate-sw.js regenerates
// it, and fails the build if the shipped worker is missing, carries a
// stale/hard-coded cache name, lost the SEC F-05 same-origin guard, or
// has no app-shell chunk precache entries when build manifests exist.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'public', 'sw.js');

function fail(msg) {
  console.error(`[assert-sw] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(swPath)) {
  fail('public/sw.js does not exist after build — scripts/generate-sw.js must run (prebuild/postbuild).');
}
const sw = fs.readFileSync(swPath, 'utf8');

if (!/const CACHE_NAME = 'ascend-[0-9a-z]+-cache';/.test(sw)) {
  fail(`CACHE_NAME is not a generated ascend-<sha>-cache name: ${/const CACHE_NAME = '[^']*'/.exec(sw)?.[0] ?? 'not found'}`);
}
if (sw.includes('__ASCEND_CACHE_NAME__') || sw.includes('__APP_SHELL_ASSETS__')) {
  fail('sw.js still contains an unsubstituted template placeholder.');
}
if (!sw.includes('url.origin !== self.location.origin')) {
  fail('sw.js is missing the SEC F-05 same-origin caching guard.');
}
if (!sw.includes('clients.claim()')) {
  fail('sw.js does not claim clients on activation.');
}

// When build manifests exist, the precache must include chunk entries.
const manifestPath = path.join(root, '.next', 'build-manifest.json');
if (fs.existsSync(manifestPath)) {
  const chunkEntries = sw.match(/'\/_next\/static\/[^']+\.(?:js|css)'/g) || [];
  if (chunkEntries.length === 0) {
    fail('build manifest exists but sw.js precaches no /_next/static JS/CSS chunks (D-PWA-2).');
  }
  console.log(`[assert-sw] ok — cache name, SEC F-05 guard, ${chunkEntries.length} precached app-shell chunks`);
} else {
  console.log('[assert-sw] ok — cache name and SEC F-05 guard present (no build manifest to check chunks against)');
}
