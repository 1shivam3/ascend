# Form Coach landmark fixtures — injection findings (Phase 0)

**Can landmarks be injected into the running app? No — not without app
code changes, which are out of scope for the Phase 0 harness.**

What exists today:

- The analyzers themselves accept landmarks directly:
  `processFrame(landmarks, timestampMs, aspectRatio)` on every analyzer
  under `src/features/form-coach/analyzers/`, fed by the synthetic
  stream builders in `tests/form-coach/batch-builders.ts`. All
  rep-status / tempo / unverified logic is already unit-tested this
  way (`tests/form-coach/rep-status-tempo.test.ts`,
  `deadlift-analyzer.test.ts`, `squat-analyzer.test.ts`, and the rest
  of `tests/form-coach/`).
- In the live app, landmarks come only from the MediaPipe pose worker
  processing a user-picked video inside `FormCoachModal`. There is no
  debug hook, URL parameter, or store field that feeds landmarks into
  that path, so a Playwright spec cannot drive a Form Coach analysis
  without either a real video + the real model, or an app change.
- A real captured stream already exists as a fixture:
  `tests/form-coach/fixtures/ground-truth-squat-landmarks.json`
  (owner's ground-truth squat video, 200 ms frames).

What this folder adds:

- `deadlift-stream.json`, `squat-stream.json` — the builders'
  `deadliftStream(3)` and `squatVariantStream('back', 3)` serialized
  ({ lm, t } frames, 100 ms steps, aspectRatio 1.0), ready to feed an
  analyzer in any future test rig that gains an injection point.
- **Pull-up: no fixture, deliberately.** ASCEND has no pull-up analyzer
  (the 11 analyzers are squat, deadlift, overhead press, bent-over row,
  bicep curl, lunge, push-up, lateral raise, plank, bench press, and
  the squat variants), so a pull-up stream would have nothing to feed.

Recommendation for a later phase (owner's call): a build-gated debug
entry (e.g. `?formcoach_fixture=<name>` in dev/QA builds only) that
feeds these streams into the modal would make Form Coach end-to-end
testable in Playwright. Not built here — Phase 0 adds no app code.
