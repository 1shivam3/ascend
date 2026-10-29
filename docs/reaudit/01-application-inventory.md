# Phase 1 — Application inventory (RE-AUDIT, 2026-10-29)

Source: fresh clone at 24a712a5. Counts measured, not estimated.

## Shape of the app

- `src/` — 246 files, ~101,500 lines of TS/TSX.
- Largest modules: `src/lib/store.ts` (4,832 — zustand store + persistence +
  sync glue), `src/components/ActiveWorkoutScreen.tsx` (4,214),
  `src/components/MealsPage.tsx` (3,970), `src/components/WorkoutPage.tsx`
  (3,410), `src/lib/i18n/en.ts` (3,062) / `hi.ts` (3,053),
  `src/lib/workout-engine.ts` (2,720), `src/lib/supabase/sync.ts` (1,785),
  `src/lib/coach-engine.ts` (1,787).
- `tests/` — 211 entries; vitest suite totals 2,356 tests at baseline.
- Root also carries: `android/` (Capacitor), `supabase/` (20 migration files,
  latest 2026102903 body_metrics unique-day), `ml/` + `model_capabilities.yaml`
  (offline meal-scan model track — ships via separate PR #22, NOT in this
  tree's runtime path), `docs/`, `archive/`, design/persona docs.

## Pages (App Router — 14 routes in the build table)

- `/` (single-page app shell — all tabs/screens are client-rendered inside it)
- `/privacy`, `/terms`, `/disclaimer`, `/delete-account` (static)
- `/robots.txt`, `/sitemap.xml` (static)
- `/_not-found`

## API routes (13, all dynamic `ƒ` in the build table)

| Route | Purpose |
|---|---|
| `/api/ai/coach` | guided coach engine endpoint |
| `/api/ai/coach-chat` | conversational coach chat (NEW, PR #59) |
| `/api/ai/parse-meal` | meal text parsing |
| `/api/ai/parse-voice` | voice meal parsing |
| `/api/ai/scan-meal` | meal photo scan (vision cascade) |
| `/api/auth/delete-account` | signed account-deletion flow |
| `/api/barcode` | barcode → nutrition lookup (Open Food Facts) |
| `/api/coach` | coach block/review endpoints |
| `/api/csp-report` | CSP violation reporting sink |
| `/api/feedback` | user feedback intake |
| `/api/notifications/dispatch` | push dispatch (QStash-triggered) |
| `/api/notifications/preferences` | notification preferences |
| `/api/notifications/subscribe` | push subscription registration |

## Request floor

- `src/middleware.ts` (100 lines) — SEC-20 floor: hardcoded allowlist of the
  13 API routes, 404 for unknown `/api/*`, 300/min per-IP ceiling. Next 16
  deprecates this convention in favour of `proxy.ts`; the rename was tried
  in PR #60 and reverted (ebf60dd) — the file registers in the Next 16
  build as "ƒ Proxy (Middleware)" (verified in the coordinator build log).

## State & data layer

- Client: zustand store (`src/lib/store.ts`) + localStorage persistence,
  per-account namespacing, snapshot/resurrection guards (gauntlet-era).
- Server: Supabase (Postgres + Auth + RLS) via `src/lib/supabase/`
  (client.ts, config.ts, sync.ts, reconcile.ts, useSupabaseSync.ts).
- Rate limiting: Supabase-backed distributed limiter (`api_rate_limits`,
  RPC `ascend_check_rate_limit`) + in-process fallback; fail-closed on AI
  routes (SEC-02 decision).

## i18n

- Two full dictionaries: `src/lib/i18n/en.ts` and `hi.ts` (~3,050 lines
  each), plus coach-specific `src/lib/coach-i18n.ts`. Numeric parity is
  measured in Phase 6.

## New since the last audit (the deltas this re-audit must judge)

1. Conversational coach chat (PR #59): `src/lib/coach-chat.ts`,
   `src/app/api/ai/coach-chat/route.ts`, `src/components/CoachChatSection.tsx`,
   `tests/coach-chat.test.ts`, 14 `coachChat.*` i18n keys.
2. Next 16.4.3 + React 19.3.1 (PR #60): Turbopack build, ESLint 9 flat
   config (`eslint.config.mjs`), middleware convention retained.
3. Dependency pins (PR #61): npm `overrides` — postcss-selector-parser
   ^6.1.5, uuid ^11.1.1.

## Explicitly out of scope / parked

- Form-check (MediaPipe Pose) — PARKED by the user 2026-10-25; lives only
  on the unmerged `feat/coach-real-gaps` branch; not present in this tree.
  Not tested, not fixed — noted here only.
- Offline meal-scan model swap (PR #22) — open/unmerged by the user's
  standing rule; the shipping scan path in this tree is the cloud cascade.
