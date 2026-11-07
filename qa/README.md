# ASCEND QA harness

Phase 0 of the QA-hardening brief: Playwright end-to-end harness layered
on top of the existing Vitest suite (which is untouched — `npm test`
still runs the unit tests, `npm run test:e2e` runs these).

## Run it

```bash
npm run test:e2e                 # all four viewport projects
npx playwright test --project=android-360x740   # one project
```

The Playwright config (`playwright.config.ts` at the repo root) builds
the app and serves the production build locally on port 3100 via its
webServer block — tests never touch the live site. To reuse a server
you started yourself, set `QA_BASE_URL=http://127.0.0.1:3100` (or any
port) and the webServer block is skipped.

Browser binary: launches use the cached Chrome headless shell at
`~/.cache/hyperframes/chrome/chrome-headless-shell/...` because the
Playwright browser download is heavy and not guaranteed in this
sandbox. Override with `QA_CHROME_PATH=/path/to/chrome`.

Projects (all with touch emulation and `isMobile`):

| Project | Viewport |
|---|---|
| pixel-412x915 | 412 x 915 |
| android-360x740 | 360 x 740 |
| small-320x568 | 320 x 568 |
| iphone-se-375x667 | 375 x 667 (iPhone SE size) |

## What is mocked

**All AI endpoints, by default.** `qa/fixtures/ai-mocks.ts` intercepts
the five routes the client calls and answers with deterministic
fixtures in the routes' real response envelopes:

- `POST /api/ai/coach-chat` — ask-the-coach chat
- `POST /api/ai/coach` and the legacy literal `POST /api/coach` —
  Coach's Take / plan tasks, fixture keyed by the request's `task`
- `POST /api/ai/scan-meal` — meal photo scan and label scan (one route)
- `POST /api/ai/parse-meal` — quick-log text parse
- `POST /api/ai/parse-voice` — voice set parse

Setting `QA_REAL_AI=1` disables the mocks and lets requests reach the
real endpoints. That flag is for the owner's manual exploratory runs
only — never set it in CI or agent-run suites. Tests must never call
paid AI APIs.

Supabase is not mocked at the network layer in Phase 0; guest personas
never sign in, and the seeded local state needs no server. Specs that
exercise sync (later phases) should stub or use a throwaway account —
never the production project with real user data.

## Fixtures

`qa/fixtures/personas.ts` — seeded local state for:

- `empty-guest` — no seed at all (truly fresh profile)
- `intermediate` — 18 workouts over 6 weeks, matching PRs, meals,
  macro goals
- `minor-15` — profile with DOB 15 years + 2 months ago
- `injuries` — training profile with Knee + Low back limitations
- `hindi` — intermediate with `language: 'hi'`
- `xl-text` — onboarded profile with Extra Large text

Seeds are written before app boot via `installSeed(page, persona)` in
the exact persisted shape the app writes itself (zustand envelope
`{ state, version: 3 }` under `ascend_store`; keys from
`partializeAppState`, nested shapes from `src/lib/types.ts`). Dates are
relative to the run date so history windows stay correct.

`qa/fixtures/helpers.ts`:

- `shot(page, persona, step)` — screenshot to
  `qa/screenshots/<persona>/<step>.png`
- `setAccent` / `setTheme` / `setTextSize` / `setLanguage` — patch the
  persisted blob and reload (real rehydration path)
- `patchStore` / `patchUiPreferences` — generic versions of the above
- `goOffline` / `goOnline`, `throttleNetwork` / `clearThrottle`
  (CDP network conditions, presets in `THROTTLE_PRESETS`)
- `mockClock(page, iso)` — Playwright clock, install before `goto`

`qa/fixtures/form-coach/` — landmark stream JSON (deadlift, squat)
plus a README explaining why landmarks cannot be injected into the
live app today and where the unit-level fixtures live. There is no
pull-up fixture: the app has no pull-up analyzer.

## Not testable in this environment

- The live production site from the sandbox browser (proxy tunnel
  fails) — everything runs against the local production build.
- Real AI providers (paid, and non-deterministic) — mocked, above.
- Camera, microphone, haptics, native Android/Capacitor surfaces, real
  push notifications — need a real device; see the manual checklist in
  the Phase 4 persona report when it exists.
- Form Coach end-to-end video analysis in a spec — no landmark
  injection point exists in the app (see form-coach README); the
  analysis logic is covered by the synthetic-landmark unit tests in
  `tests/form-coach/`.
