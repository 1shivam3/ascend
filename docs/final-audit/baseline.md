# ASCEND — Final Certification: Baseline

Round 1a of the Final Certification program (baseline + inventories + design-system audit).
Audit branch: `audit/final-certification-2026-11`. This round is documentation-only; **no source code was changed.**

## 1. Build identity

| Fact | Value | Verified by |
|---|---|---|
| Repo | `1shivam3/ascend` (public) | — |
| Master SHA | `62e25543fe57755a07860ac745ca51b3a2353cc2` | `git rev-parse HEAD` in `~/workspace/ascend-final-cert` |
| Master tip commit | "Merge pull request #94 from 1shivam3/feat/form-coach-bridge", 2026-11-04 08:40 IST | `git log -1` |
| Production URL | https://ascendtonext.vercel.app/ | — |
| Production service-worker cache name | `ascend-62e2554-cache` | `curl https://ascendtonext.vercel.app/sw.js` (2026-11-04) — matches master short SHA, so production serves exactly the audited build |
| App package | `ascend` v`2.0.0` (private) | `package.json` |
| Baseline recorded | 2026-11-04, Asia/Calcutta | — |

### Framework / dependency versions (resolved, from `package-lock.json`, lockfileVersion 3)

| Package | Declared (`package.json`) | Resolved (lockfile) |
|---|---|---|
| next | `16.4.3` | 16.4.3 |
| react / react-dom | `^19.3.1` | 19.3.1 |
| tailwindcss | `^3.4.13` | 3.4.19 (Tailwind v3, `tailwind.config.js`, PostCSS) |
| typescript | `^5.6.3` | 5.9.3 |
| zustand | `^4.5.5` | 4.5.7 |
| @supabase/supabase-js | `^2.117.3` | 2.117.3 |
| lucide-react | `^0.451.0` | 0.451.0 |
| @mediapipe/tasks-vision | `0.10.21` | 0.10.21 |
| vitest | `^5.0.4` | 5.0.4 |
| eslint | `^9.39.5` | 9.39.5 |

Architecture in one line: a Next.js 16 single-page application (one root `page.tsx` composing five tab screens), local-first Zustand persistence (`ascend_store` localStorage key), optional Supabase auth + sync, server AI routes under `src/app/api`, PWA via a generated service worker (`scripts/generate-sw.js`, prebuild/postbuild hooks). A Capacitor 8 Android wrapper exists in-repo (`@capacitor/*` deps) but the audited product is the web app.

Repo size: 264 TypeScript/TSX files under `src/`, ~105,900 lines; 112 modules in `src/lib/`; 249 test files under `tests/`.

## 2. Access matrix (facts of this audit environment)

| Capability | Status | Notes |
|---|---|---|
| Source code | ✅ Full | Clone at `~/workspace/ascend-final-cert`, clean tree at master `62e25543` at audit start |
| Git history / branches | ✅ Full | 5 remote branches (see §3) |
| Terminal / package scripts | ✅ | node_modules installed; vitest, tsc, eslint all runnable locally |
| Production URL | ✅ Read | sw.js cache name verified; no production writes performed or permitted in this round |
| Browser (live app) | ✅ | Via the parent agent's browser tooling; guest profile carries seeded demo data ("Alex") |
| Supabase | ⚠️ Production project only, REST, read-oriented | Project `gxghnmfdzmiubykooifs` via connector (service-role key, `apikey` header). **No staging environment exists.** Migrations require the owner's dashboard action; none were attempted |
| Test accounts | ⚠️ Guest mode only | No second controlled account for cross-account isolation testing in this round |
| Physical devices | ❌ | No phone attached; all device behavior is NOT VERIFIED unless a check ran in a real browser build |
| Human testers | ❌ | None; synthetic personas only in later rounds, never reported as human research |

Rules honored in this round: production untouched; no merges; the only writes are the documents on this audit branch.

## 3. Repository health snapshot (all commands actually run, 2026-11-04)

### Test suite — `npx vitest run` (full run, output to log)

- **Test files: 249 — 248 passed, 1 failed.**
- **Tests: 2,822 — 2,802 passed, 20 failed.**
- **All 20 failures are in `tests/security-integration-gate.test.ts`** and are the known environment baseline: that file needs a Dockerized PostgreSQL/Supabase stack that does not exist on this VM (failures are connection/AuthRetryableFetch errors at user-creation setup, not assertion failures in app logic).
- No other test file fails. The suite includes the coach simulation harness (37 tests), the Form Coach suite (10 files), and the final-cert regression files from prior audits.

### Type check — `./node_modules/.bin/tsc --noEmit`

- **Exit 0 — zero errors.**

### Lint — `npx eslint .` (the repo's `lint` script)

- **103 problems: 2 errors, 101 warnings.**
- Both errors are the same false positive in **vendored MediaPipe glue code** — `public/mediapipe/wasm/vision_wasm_internal.js:10` and `vision_wasm_nosimd_internal.js:10`, where `react-hooks/rules-of-hooks` misreads Emscripten's `GLctx.useProgram`. These are third-party generated files, not app code.
- App-authored code therefore stands at **0 lint errors / 101 warnings** (predominantly `react-hooks/exhaustive-deps` and `react-hooks/set-state-in-effect`).

### Git state

Branches (5, verified via API at audit start):

| Branch | Tip | State |
|---|---|---|
| `master` | `62e25543` | Audited build |
| `feat/offline-scan` | `052d4241` | Open PR #22 |
| `review/all-pending` | `7e5932be` | Open PR #42 |
| `feat/cloudflare-vision-provider` | `c7a110dd` | Open PR #53 |
| `feat/coach-real-gaps` | `d8228517` | No PR; holds unique unmerged work (per-muscle readiness + parked live-camera form-check source) |

Open PRs (verified via API at audit start): **#22** (offline on-device food scan, `feat/offline-scan`), **#42** (combined review, `review/all-pending`), **#53** (Cloudflare vision provider, `feat/cloudflare-vision-provider`). None is merged; none is part of the audited production build except where their content previously landed via other PRs.

### Standing caveats carried into this certification (from prior verified work)

- The 20-failure Docker baseline is environmental; it also means the security-integration gate's live-DB assertions are **not currently executable** in this environment.
- Form Coach (merged PRs #93/#94) runtime on a real phone is **NOT VERIFIED**: on this GPU-less VM the VIDEO-mode pose path returned no landmarks under SwiftShader, while IMAGE mode on identical assets tracked 214/227 frames of a real test video.
- The rest-timer audible chime (PR #70) has never been confirmed on a physical phone.
- The kidotv/Google-side items in other programs are out of scope for this repository audit.
