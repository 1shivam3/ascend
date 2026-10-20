# Exercise Demo Media — License Audit & Decision

*Audit date: 2026-10-20. Every claim below was checked against the source's own
published material on that date. Licenses and provenance can change — re-audit
before adding any new external source.*

## Requirement

Demo media ships inside a commercial app (Play Store). Any third-party photo,
GIF, or video we bundle must be verifiably licensed for commercial use —
"the repo said it was fine" is not enough; the *actual rights holder* of each
image must have granted those rights.

## Sources audited

### 1. yuhonas/free-exercise-db (GitHub) — REJECTED for images

- The repository carries an **Unlicense** badge and describes itself as an
  "Open Public Domain Exercise Dataset" (README, checked 2026-10-20).
- However, the same README documents the provenance: the dataset is a
  restructuring of **wrkout/exercises.json** by a third party. The
  photographs are therefore second-hand assets the repo maintainer did not
  shoot and does not demonstrably own.
- A maintainer's Unlicense can only convey rights the maintainer actually
  holds. For the ~2,600 photographs there is no documented chain of rights
  from the original photographers/models, and no per-image license record.
- **Verdict: the JSON data structure is public-domain; the images' rights do
  NOT verify clean. Do not bundle these images in a commercial app.**

### 2. Wikimedia Commons — NOT SELECTED

- Commons hosts genuinely clean files (CC0, public domain, CC BY), but each
  file carries its *own* license and attribution requirements; there is no
  blanket grant. A usable set would need per-file verification, attribution
  tracking, and (for CC BY-SA) share-alike handling.
- Coverage of the specific top-24 gym movements as *animations* is thin and
  visually inconsistent (unrelated photographers, settings, and framing) —
  a poor fit for a polished in-workout surface.
- **Verdict: legally possible file-by-file, but no coherent, verified set
  was available. Not selected.**

### 3. Government / public-domain sources — NOT SELECTED

- No coherent set of exercise demonstration animations exists from
  .gov/.mil public-domain material that covers the app's core movements.
- **Verdict: nothing to license because nothing suitable exists.**

## Decision: original animated SVG demos

Since no external source verifies clean, ASCEND ships **hand-built animated
SVG demos** drawn for this app:

- 100% original artwork (stick-figure line animations in the app's visual
  language) — zero third-party rights involved, no attribution burden, no
  takedown surface.
- Tiny: each demo is a few hundred bytes of vector keyframes, far under the
  150 KB per-item budget, and resolution-independent.
- Coverage: the ~24 most-prescribed exercises (see manifest).

## Manifest

The exercise → media mapping, with the license/source recorded per item,
lives in **`src/lib/exercise-media.ts`** (`EXERCISE_DEMO_MANIFEST`).
Every entry records:

- `demoId` — the animation in `src/components/ExerciseDemo.tsx`
- `exerciseNames` — app exercise names/aliases the demo answers to
- `source` — "Original ASCEND artwork"
- `license` — original in-app artwork; no third-party media

Exercises with no manifest entry simply show no demo affordance — the UI
never renders a placeholder or "coming soon" text.
