# Persona Review R2: Imran, 26 — Budget Phone, 2GB RAM, Slow 4G, Storage-Tight (NEW persona)

*Codebase: `~/workspace/ascend`, branch `feat/overnight-build`, read-only code trace. Device profile: ~2GB RAM Android, slow/flaky 4G, a few hundred MB of free storage, Chrome/Android WebView localStorage quota ~5MB/origin. Every claim verified in code; bundle figures measured from the repo's existing `.next` production build (2026-10-19).*

---

## First impression

He installs the Android app (or opens the PWA) on 4G and waits. And waits. The reason is measurable: ASCEND is a single-page app in which **all five tab screens are statically imported into the root page** — `src/app/page.tsx:13-19` imports HomePage, ProgressPage, WorkoutPage, MealsPage, ProfileView, SettingsView and Onboarding eagerly; only modals are lazy. The existing production build's page chunk is **1.13 MB raw / ~255 KB gzip by itself**, and the initial route's JS totals **≈1.81 MB raw / ≈700 KB gzip** across its chunks. On slow 4G that's many seconds of download before parse even starts; on a 2GB-RAM device, parsing and executing ~1.8MB of JS is exactly the workload that produces multi-second freezes and WebView kills. His first impression is a splash screen and doubt.

Once in, day-to-day use is better than the first load suggests — the team has clearly thought about low-end devices in places (below). The danger for Imran isn't slowness. It's that the app can **silently stop saving his data**, and will never tell him.

## What worked

- **Image pipeline is genuinely low-end-aware.** `src/lib/image-processing.ts`: `MAX_IMAGE_DIMENSION = 800`, JPEG quality 0.70 (ProgressPage passes 0.72), decode-time resize via `createImageBitmap` with `ImageBitmap` handles closed in finally blocks, `toBlob` instead of heap-hungry `toDataURL`. Progress photos land at roughly 80-200 KB as dataURLs — an order of magnitude better than naive implementations.
- **Photos are kept out of the startup blob.** Progress photos live under their own key (`PROGRESS_PHOTOS_KEY = 'ascend_progress_photos_v1'`, `src/lib/store.ts:377-378`) and are excluded from the persisted store via `partializeAppState` (store.ts:441+) specifically so startup never JSON-parses megabytes of base64. The 24-photo cap is disclosed in the UI when hit (`ProgressPage.tsx:260-263` — oldest-photo eviction gets a toast, not silence). Good.
- **Heavy features are lazy where it counts.** Modals use `next/dynamic` (`page.tsx:22-27`; `HomePage.tsx:47-53`); the ZXing barcode engine is dynamically imported only when scanning (`BarcodeScannerModal.tsx:304`); `@google/genai` is server-only (API routes under `src/app/api/ai/`), never in the client bundle. Fonts are self-hosted via `next/font` with `display: 'optional'` (`src/app/layout.tsx:9-13`).
- **Logging is local-first and offline-safe.** All state persists to localStorage via zustand persist (`store.ts:2237-2240`); the Supabase sync engine re-triggers on the browser `online` event (`src/lib/supabase/sync.ts:135-145`), so a workout logged in a dead-zone gym is stored on-device and syncs when connectivity returns. No queue UI, but no queue needed for the core loop.
- **Service worker exists and is sane in outline**: precache of `/`, manifest, icons (`public/sw.js:3-10`); network-first navigations with cache fallback (sw.js:70-89); stale-while-revalidate for `/_next/static` and assets (sw.js:92-118); `/api/` network-only with a 503 JSON offline response. Repeat visits *can* load offline.

## Friction & bugs

### IMRAN-1 (trust-breaker, REAL BUG): progress photos can "save" successfully and be gone tomorrow — silently, with no backup
Chain, all verified:
1. `addProgressPhoto` → `persistProgressPhotos` (`src/lib/store.ts:418-425`) wraps `localStorage.setItem` in a try/catch whose entire quota handling is a comment: `// Quota exceeded: photos stay in memory for this session.` The photo is **not persisted** and **no error propagates**.
2. The UI then unconditionally celebrates: `ProgressPage.tsx:251-267` calls `addProgressPhoto(...)` and immediately shows `toast.success('Progress photo saved locally.', 'Photo Added')` — it cannot know the write failed, because the store never tells it.
3. There is no safety net: progress photos are device-local only — no `progress_photos` table or sync path exists (grep across `src/lib/supabase/` and `supabase/schema.sql`: zero hits).

So on a storage-tight phone, Imran takes his monthly progress photos, gets a success toast for each, and finds them gone at next launch. Progress photos are the most emotionally loaded data in a fitness app; "saved" that wasn't is the definition of a trust-breaker.

### IMRAN-2 (trust-breaker, REAL BUG): storage amplification makes quota exhaustion a *when*, and every failure path is silent
The same data is written to localStorage **three times over**:
- the zustand persist blob `ascend_store` (`store.ts:2238`), containing the *entire* history — all workouts, meals, metrics, plans (no pruning exists for workouts/meals; only `coach.readinessHistory` is capped, at 90, store.ts:664);
- a store subscriber (`store.ts:2464-2501`) that, 500ms after every change, stringifies and writes an `ascend_emergency_snapshot` duplicating profile/prs/workouts/meals/plans **plus** separate legacy keys `ascend_profile`, `ascend_prs`, `ascend_workouts`, `ascend_meals`;
- the photos key (IMRAN-1): up to 24 × ~80-200 KB ≈ **2-4.8 MB on its own**, against a ~5 MB/origin quota that budget Android Chrome/WebView commonly enforces — a quota the main blob and its duplicates are also competing for.

When the quota is hit: the snapshot writer swallows it (`catch {}` at `store.ts:2501`), photo persistence swallows it (IMRAN-1), and the zustand persist write has **no app-level error surface at all** — the persist config (`store.ts:2237-2440`) registers no error handler, and a grep for any storage-full/low-storage copy across `src/` returns zero. Net effect for Imran: at some point in month 2-4, new workouts and meals keep "working" in-session (in-memory state) and are simply not there tomorrow. No warning, no "storage full," no export prompt. Silent data loss is the worst failure class a logging app can have, and on his hardware it is not an edge case — it is the expected steady state.

### IMRAN-3 (major, REAL BUG): first-load cost is one giant page chunk
As measured above: `page.tsx:13-19` statically imports every tab screen, so the initial route ships ≈1.81 MB raw / ≈700 KB gzip JS (existing `.next` build, app page chunk 1.13 MB raw / ~255 KB gzip alone). Tab-level code-splitting doesn't exist; a user who only ever opens Home + Train downloads Progress, Meals, Profile, Settings and Onboarding too. Compounding it, `MealsPage.tsx:49` statically imports `BarcodeScannerModal` (the ZXing engine inside is lazy, but the modal shell and its dependency tree ride the main bundle anyway). On his connection, cold start is download-bound, then parse-bound on a 2GB-RAM CPU. The Capacitor shell makes it worse (IMRAN-5).

### IMRAN-4 (major, REAL BUG): offline/slow-network cold start has no timeout and a thin precache
- The SW navigation handler (`public/sw.js:70-89`) is network-first with **no timeout race**: on flaky 4G where the connection hangs rather than fails, `fetch(request)` can stall for a very long time before the cache fallback ever runs. Slow-network users get the worst of both strategies — they wait for the network *and* get the stale page.
- The precache (`sw.js:3-10`) contains only `/`, the manifest and icons. The JS chunks that the cached `/` HTML references enter the cache only via runtime stale-while-revalidate *after* a successful online fetch. After an app update changes chunk hashes, a user who goes offline before revisiting can hold cached HTML pointing at chunks that were never cached — a broken shell until they're back online. (Code-grounded risk from the caching strategy; not reproduced against a live deployment in this review.)

### IMRAN-5 (minor, REAL BUG / architecture): the Android app is a remote shell
`capacitor.config.ts`: `server.url = 'https://ascendtonext.vercel.app'` with `webDir: 'public'` — the APK bundles essentially nothing and loads the web app over the network at cold start. Every cold start on slow 4G pays the IMRAN-3 download (mitigated only if the WebView's service-worker cache is warm and honored — behavior inside the Capacitor WebView is **UNVERIFIED** in this review; it cannot be tested from code alone). For a user whose constraint is connectivity, the "app" is a bookmark with an icon until proven otherwise.

### IMRAN-6 (minor, REAL BUG — perf): every change re-serializes his entire history, twice
Two full-state JSON.stringifies chase every store update: zustand persist writes the whole blob, and the `store.ts:2464` subscriber stringifies the snapshot + legacy keys again (debounced 500ms, but workouts/meals arrays are the bulk and they only grow — no history cap). The coach digest (`src/lib/use-coach-digest.ts:38-84`) is memoized, but its inputs are the raw `workouts`/`meals` arrays, so any change recomputes readiness (sorts full history, computes tonnage across it), `detectPatterns` (8-week scan), `buildActiveDays` and streak over all history. Individually each is O(history); stacked on a 2GB-RAM phone in month 6, mid-workout set logging is where he'll feel it — small hitches on every logged set, growing with his history. Not a blocker today; a slow tax forever.

### Minor notes
- `validateImageFile` allows inputs up to 35 MB (`image-processing.ts`, `MAX_INPUT_FILE_SIZE`) — decode-time `createImageBitmap` resizing mostly defuses the RAM risk on modern Chrome, but the fallback ImageElement path on older WebViews allocates the full bitmap first. Edge-casey; the pipeline's care elsewhere earns it a pass with a note.
- API routes are network-only by design (sw.js:54-67) — AI features (meal scan, AI coach) simply 503 offline. Acceptable, but on his connection "AI is thinking" failures will be routine; the deterministic fallbacks (`generateOfflineMealEstimate`) only cover meal scan.

### His simulated week
Mon: install over 4G — long first load (IMRAN-3). Logs his first workout offline in a basement gym — works, syncs later (the week's high point). Wed: barcode scan downloads the ZXing chunk on 4G — a pause, then works. Fri: adds progress photos Front/Side/Back — three success toasts. Sat: phone's other apps eat storage; Chrome evicts/quota-squeezes the origin. Sun: opens ASCEND — photos gone (IMRAN-1), and from here on some workout writes begin failing silently too (IMRAN-2). He doesn't know yet. He finds out in two weeks, all at once, and uninstalls — not because the app was slow, but because it lied by omission.

## Keep-or-delete verdict

**Keeps it for week 1, deletes it in month 2 — at the moment he discovers the silent loss.** His constraints were knowable in advance (quota, bandwidth, RAM are the default for the world's most common phone class), and the app handles exactly one of the three well: images are thoughtfully compressed, but storage *accounting* — how much is written, how many copies, what happens when writes fail — was never designed. Bandwidth is spent once (first load) and forgiven; lost data is not forgiven.

**What would make him delete it:** opening Progress to compare month-1 vs month-2 photos and finding month 1 missing after a "Photo Added" success toast (IMRAN-1). Nothing else comes close.

## Competitor gap

- **Strong / Hevy on low-end Android**: native or near-native shells, local DB (SQLite/Room) with no 5MB cliff, storage errors surfaced, and app binaries that open fully offline. ASCEND's ceiling is a browser quota it shares with its own duplicate snapshots.
- **MyFitnessPal-class apps**: photo/data sync to cloud by default — device storage pressure never becomes data loss. ASCEND's photos have no cloud path at all.
- The deeper gap: competitors treat **persistence failure as a user-facing event**. ASCEND treats it as a comment in a catch block (`store.ts:423`). On flagship hardware that difference is invisible; on Imran's phone it's the whole product.

## Rating: 4 / 10

The highest of this round's three — because unlike Kavya and Rahul, Imran's *use case* (lifting + meals + photos) is fully supported, and the local-first core genuinely works on his connection once loaded. The points come off for: a ~700 KB-gzip first load with no tab splitting (IMRAN-3), a no-timeout network-first SW (IMRAN-4), triple-written storage (IMRAN-2), and the unforgivable one — success toasts for writes that silently failed, on the data he can least replace (IMRAN-1). Fix order: surface persistence errors + dedupe storage first; split the bundle second.
