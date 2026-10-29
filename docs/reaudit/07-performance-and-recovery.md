# Phase 7 — Performance & Recovery (Independent Re-Audit)

- **Tree:** `~/workspace/ascend-reaudit`, master `24a712a5`, Next.js 16.4.3 + React 19.3.1
- **Method:** static/code-level evidence only — production build output in `.next/`,
  `/tmp/reaudit-build.log`, service-worker template + generated worker, error/recovery
  components read in source. No live browser, no device, no network timing was available
  to this phase; anything requiring a live run is listed under NOT TESTED.
- **Coordinator gates (accepted as given):** tsc clean, lint 0 errors / 97 warnings,
  vitest 2336 pass / 20 known-infra failures, build PASS.

## Severity summary

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 4 |
| Observations / known items (not defects) | 4 |

Performance and recovery posture is strong: aggressive code-splitting, a versioned
service worker with an update prompt, a persistent sync-failure banner with retry, and
quota/corruption-guarded persistence. The findings below are residual polish items.

---

## 1. Build output analysis

Evidence: `/tmp/reaudit-build.log`, `.next/app-path-routes-manifest.json`,
`.next/prerender-manifest.json`, `.next/build-manifest.json`, `.next/static/chunks/`.

- **Builder: Turbopack confirmed** — build log line 8: `▲ Next.js 16.4.3 (Turbopack)`;
  chunk files carry the `turbopack-*.js` runtime chunk.
- **Static generation:** build log reports `Generating static pages (14/14)`.
- **Route table (build log, verbatim shape): 21 routes**
  - 8 static (`○`): `/`, `/_not-found`, `/delete-account`, `/disclaimer`, `/privacy`,
    `/robots.txt`, `/sitemap.xml`, `/terms`
  - 13 dynamic (`ƒ`) API routes: `/api/ai/coach`, `/api/ai/coach-chat`,
    `/api/ai/parse-meal`, `/api/ai/parse-voice`, `/api/ai/scan-meal`,
    `/api/auth/delete-account`, `/api/barcode`, `/api/coach`, `/api/csp-report`,
    `/api/feedback`, `/api/notifications/dispatch`, `/api/notifications/preferences`,
    `/api/notifications/subscribe`
  - plus `ƒ Proxy (Middleware)` (the log also carries the Next 16 notice that the
    `middleware` file convention is deprecated in favour of `proxy` — informational only).
  - Prerender manifest lists 9 prerendered routes (the 8 above plus the framework's
    `/_global-error`).
- **Client chunks:** 57 `.js` files under `.next/static/chunks`, **3,833,532 bytes raw
  total (~3.9 MB)**, 13 of them ≥ 100 KB. Largest:

  | Chunk | Raw bytes | gzip bytes | Identification |
  |---|---|---|---|
  | `2082bzl3a36dr.js` | 478,310 | 124,460 | ZXing barcode/QR decoding (`@zxing`) — lazy, see below |
  | `0ldqwgyc26pd0.js` | 339,821 | 107,415 | app code (React-adjacent module graph) |
  | `2hep_atordcdr.js` | 339,105 | 75,458 | app code |
  | `0cprwz0djjbrn.js` | 282,009 | 62,364 | i18n dictionaries — contains **both** `en` and `hi` objects |
  | `0wocxpi3o7bii.js` | 243,566 | 62,883 | app code |
  | `0d66q46efh1wk.js` | 228,651 | — | root main file (initial load) |

- **Initial-load set** (`build-manifest.json` → `rootMainFiles`): 5 files totalling
  **442,305 bytes raw** (`1kexj4s7oxhs2.js` 6,530; `1df0it1_ijv6v.js` 42,967;
  `0d66q46efh1wk.js` 228,651; `11iacbe9dxga4.js` 154,127; `turbopack-3-ry682tkyiqk.js`
  10,030). The single-page app shell then lazy-loads per-tab chunks.
- **Code-splitting is deliberate and broad:** 13 `next/dynamic` split points —
  the four non-Home tab pages and ImportProgramModal (`src/app/page.tsx:30-51`),
  six heavy modals in `src/components/HomePage.tsx:79-84` (incl. ScanMealModal,
  BarcodeScannerModal, BodyMetricsModal), and BarcodeScannerModal again in
  `src/components/MealsPage.tsx:80-82` with an explicit comment that ZXing is
  "one of the heaviest leaves … load it on demand instead of at tab open."
  The 478 KB ZXing chunk is therefore **not** in the initial-load path.

### Findings

**PERF-R1 (P3) — Both language dictionaries ship to every user in one chunk.**
`0cprwz0djjbrn.js` (282,009 raw / 62,364 gzip) embeds both the `en` and `hi`
dictionaries (source: `src/lib/i18n/en.ts` 176 KB, `hi.ts` 300 KB; 2,958 keys each —
see Phase 6). A user who never switches language still downloads both. This is the
conscious price of instant in-app switching via `translate()` fallback
(`src/lib/i18n/index.ts`), and at ~62 KB gzip it is not a defect — recorded so the
trade-off is explicit if the dictionary keeps growing.

**PERF-R2 (P3) — No `next/image` anywhere; 7 raw `<img>` elements, no image
optimization pipeline.** `grep`: 0 imports of `next/image`, 0 `<Image>` usages;
7 `<img>` (all carry `alt` — Phase 6). `next.config.js` defines no `images` key, so
remote patterns are Next defaults. In practice the 7 images are user data-URLs
(progress photos, avatars, meal previews) and one local hero
(`/images/splash-athlete.jpg`, `src/components/WorkoutDetailsView.tsx:143`), which
`next/image` could not optimize anyway (data-URLs) or barely (one static asset).
Residual risk is limited to layout shift on the one static hero; low priority.

---

## 2. Service worker

Evidence: `scripts/generate-sw.js`, `public/sw.template.js` → generated
`public/sw.js` (201 lines), `src/components/ServiceWorkerRegister.tsx`,
`next.config.js` headers for `/sw.js` (`Cache-Control: no-cache, no-store,
must-revalidate`, `Service-Worker-Allowed: /`).

- **Cache versioning (fixed properly):** `prebuild` runs `scripts/generate-sw.js`,
  which stamps `CACHE_NAME = ascend-<sha>-cache` from `VERCEL_GIT_COMMIT_SHA`
  (first 7 chars). Every deploy changes the worker bytes, so browsers install the
  new worker. The local re-audit build had no Vercel SHA, so its log/worker show
  the dev fallback `ascend-dev-cache` (`/tmp/reaudit-build.log` line 4) — expected
  locally, not a production defect.
- **What is cached:**
  - Precache (install): `/`, `/manifest.json`, `/icon.svg`, `/icon-192.png`,
    `/icon-512.png`, `/icon-maskable-512.png` (`public/sw.js:4-11`); precache
    failure is non-blocking; `skipWaiting()` on install.
  - Navigation: network-first raced against a **3 s timeout**, falls back to the
    cached page, then cached `/`, then an inline `503` "You are offline" HTML page.
  - Static assets (`/_next/static/`, `.svg/.png/.ico/.css/.js`): stale-while-revalidate.
  - Everything else GET: network with cache fallback.
  - `/api/*`: **network-only**; on failure returns `503 {"error":"Offline", …}` JSON —
    no stale API data is ever served.
  - Activate: deletes every cache whose name ≠ current `CACHE_NAME`, then
    `clients.claim()`.
  - Push + notificationclick handlers are in the same worker (reminder delivery,
    NAVIGATE_TAB postMessage).
- **Update behaviour (client side):** `ServiceWorkerRegister.tsx` registers `/sw.js`
  on window load (with a `readyState === 'complete'` fallback), detects a waiting
  worker at registration and via `updatefound` → `statechange === 'installed'` with
  an existing controller, and shows a **"New version available" banner with Refresh
  and Dismiss buttons** (`role="status"`). It never force-reloads (a reload could
  interrupt a workout). Gauntlet R10 behaviour is present in code: dismissal starts
  a re-prompt watch — `UPDATE_REPROMPT_MS = 30 * 60 * 1000` and
  `shouldResurfaceUpdate()` resurfaces the banner after 30 min while a worker is
  still waiting.
- **Offline fallback:** no dedicated `/offline` route; the fallback chain is
  cached page → cached `/` → inline offline HTML (worker), plus in-app surfaces:
  `OfflineState` component (retry / continue-offline actions), and the offline
  banner in `src/app/page.tsx` (`role="status"`, opens offline details).

No PERF finding in this section — the worker design is sound at code level.
(One cross-reference: the update banner's strings are hardcoded English — a
Phase 6 i18n finding, UX-R4.)

---

## 3. Recovery

- **Error boundary:** `src/app/error.tsx` — client boundary rendering
  `ErrorState` with **Try again (`reset`)**, **Return home**, and an
  **emergency-reset** action (`src/components/ErrorState.tsx:105-131`), and it logs
  only a redacted message (`redactSecrets`, `src/app/error.tsx:22-25`).
  `src/app/loading.tsx` and `src/app/not-found.tsx` also exist.

**PERF-R3 (P3) — No `src/app/global-error.tsx`.** A failure in the root layout
itself (providers in `layout.tsx`: Telemetry/Toast/Navigation) bypasses
`src/app/error.tsx` and lands on Next's framework fallback (the build does emit a
`/_global-error` route) — an unstyled page with no ASCEND recovery actions
(no reset-with-branding, no emergency reset, no support path). Probability is low
(the layout is thin), impact is a dead-end screen if it ever fires.

- **Sync failure:** `src/components/SyncErrorBanner.tsx` — persistent top banner
  (`role="alert"`) rendered on every tab while the sync engine is in `error` state
  and a user is signed in (`shouldShowSyncError`, lines 22-24); **Retry** button
  calls `syncNow()`; clears itself when the engine recovers. Copy is i18n
  (`home.syncErrorBanner` / `home.syncRetry`). Guests see nothing (nothing to sync).
  This is exactly the surface the standing "never fake success" posture requires.
- **localStorage quota / corruption guards (code evidence):**
  - Main zustand persist adapter `mainStoreStorage` (`src/lib/store.ts:1023-1087`):
    every `getItem`/`setItem`/`removeItem` is try/catch-wrapped; a failed write
    flips the `mainStoreWriteFailed` health flag (cleared by the next successful
    write) instead of throwing, and the Data Vault surfaces it with a remedy —
    the QA4A-004 fix for the old silent-quota-failure mode. Cross-tab leader-guard
    write suppression is deliberate and does **not** trip the flag.
  - `src/lib/storage.ts`: `load()` wraps `JSON.parse` in try/catch and returns the
    default on corruption (line 108-113); backup export wraps parse failures
    (line 369-385); backup import rejects empty/unreadable files, enforces a
    **10 MB cap** before parsing (Gauntlet R12, lines 410-428), and records a
    human-readable `lastImportError`.
  - Small dedicated keys self-heal: avatar mirror (`persistAvatarMirror` /
    `loadAvatarMirror`, try/catch, `src/lib/store.ts:652-672`) and progress photos
    (`persistProgressPhotos` returns `false` on quota failure so the UI must not
    claim the photo was saved; loads validate `Array.isArray` and cap at 24).
  - `src/lib/delete-persist-guard.ts`: follower-tab deletes take over leadership
    and rehydrate before deleting; any failure returns `false` and callers must
    not show a success toast.
  - Persist migrations exist and are defensive (v1→v2→v3 shape healing,
    `src/lib/store.ts:780-1006`).

No PERF finding in sync/persistence — recovery behaviour is thoroughly guarded at
code level.

---

## 4. Images & fonts

- **Images:** see PERF-R2. Remote image hosts actually used are constrained by the
  CSP `img-src` in `next.config.js` (`*.supabase.co`, `images.openfoodfacts.org`,
  `lh3.googleusercontent.com`, analytics hosts), not by a Next `images` config.
- **Fonts** (`src/app/layout.tsx:3,10-24`), all via `next/font/google`
  (self-hosted at build, `font-src 'self'` in CSP is consistent):
  - Inter (latin) — `--font-sans`, `display: 'optional'`, preloaded (primary UI font).
  - Noto Sans Devanagari (devanagari) — `--font-devanagari`, `display: 'swap'`,
    `preload: false` — English-only users never download it; Hindi glyphs no longer
    fall back to random system fonts.
  - Barlow Condensed 600/700 (latin) — `--font-display`, `display: 'swap'`,
    `preload: false`.

**PERF-R4 (P3) — Inter uses `display: 'optional'`.** On a slow first load the
browser may keep the fallback font for the whole first paint (and, per the
`optional` algorithm, potentially the session's first render) rather than swapping
Inter in late. This avoids layout shift but can leave first-visit gym-connection
users on a system font. A deliberate trade-off; flagged only so it is a recorded
choice, consistent with the `preload: false` + `swap` treatment of the other two
fonts.

---

## 5. Capacitor

`capacitor.config.ts`: `appId: 'com.ascend.training'`, `appName: 'ASCEND'`,
`webDir: 'public'`, and

```ts
server: { url: 'https://ascendtonext.vercel.app', cleartext: false, androidScheme: 'https' }
```

**Known pre-Play item — NOT a defect.** The shell still loads the live Vercel URL.
This matches the current state of the recorded packaging decision (keep the
URL-loaded shell during development; switch to a bundled web app before/at Play
Store submission). Security posture of the shell itself is sane:
`allowMixedContent: false`, `webContentsDebuggingEnabled: false`, cleartext off.

---

## Observations (not defects)

- **PERF-O1:** `experimental: { cpus: 1, workerThreads: false }` in
  `next.config.js` pins build parallelism to 1 worker (visible in the build log:
  "using 1 worker"). Build took ~36 s compile + ~39 s TypeScript in this
  environment; a deliberate resource constraint of this VM, not user-facing.
- **PERF-O2:** The React Compiler lint family (42 `set-state-in-effect`,
  17 `preserve-manual-memoization` — Phase 6 census) marks render-path work the
  compiler cannot auto-memoize. No code-level evidence of a user-facing jank
  problem; real-device profiling is NOT TESTED (below).

## NOT TESTED (live-only — no browser/device in this phase)

- Real-device performance: cold start, tab-switch latency, INP/long-tasks on a
  mid-range Android phone (the Capacitor shell's actual environment).
- Lighthouse / Core Web Vitals (LCP, CLS, INP) on production or preview.
- Service-worker behaviour end-to-end: first install, update prompt appearance
  across a real deploy, offline navigation on a real connection drop, push delivery.
- Slow-network behaviour of the 3 s navigation race and `display: 'optional'` font
  outcome on a throttled connection.
- localStorage quota exhaustion in a real browser (guard logic is code-verified;
  the Data Vault surfacing was not exercised live).
- Error-boundary rendering in a running build (incl. the `global-error` fallback
  path in PERF-R3).
- Whether the production (Vercel) build's worker carries the commit-SHA cache name
  (verified locally only with the `dev` fallback).
