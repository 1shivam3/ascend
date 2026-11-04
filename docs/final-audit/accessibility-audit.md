# Accessibility Audit — ASCEND Final Certification, Round 1c-2

- **Build audited:** master `62e25543`, local production build (same
  substitution and labelling as device-compatibility.md). Probes ran in
  headless Chromium at 390×844 against onboarded guest profiles, plus
  token mathematics from `src/app/globals.css`. **No real screen reader
  and no physical device was used** — behavioural claims are DOM/keyboard
  probes, not assistive-technology sessions.
- Headline: **no P1/P2 accessibility defect was found.** Primary text
  passes WCAG AA contrast in both themes; modals trap focus, close on
  Esc, and return focus; focus is visible on 100% of probed stops; the
  unnamed-button count for the whole app is exactly one (re-verified).
  The findings are P3 polish items, led by one real contrast failure in
  a secondary element (A11Y-01).

## 1. Contrast (WCAG 2.x ratios, computed from the shipped tokens)

Every text-token pair passes AA (≥4.5:1 for normal text) in **both**
themes. Full matrix (fg on bg):

**Light (Chalk):** text-primary `#171916` — 15.52 / 14.04 / 12.89 /
17.69 on bg-primary/secondary/tertiary/card. text-secondary `#5E615A` —
5.53 / 5.00 / **4.59** / 6.30. text-muted `#625D50` — 5.76 / 5.21 /
**4.78** / 6.56. accent-text `#C7351B` — 4.66 on bg-primary, 5.31 on
card, 4.80 on accent-subtle. success `#157347` 5.17 on its bg / 5.87 on
card; warning `#8A5A00` 5.22 / 5.93; danger `#B42318` 5.59 / 6.57.
Thinnest passes: text-secondary on bg-tertiary (4.59) and text-muted on
bg-tertiary (4.78) — passing, with <0.3 of headroom.

**Dark (Graphite):** text-primary `#F3F0E7` — 16.25 / 15.26 / 13.94 /
13.14 / 11.44 on bg-primary/secondary/tertiary/card/elevated.
text-secondary `#AFB3AB` — 8.69 … 6.12. text-muted `#9EA29A` — 7.13 …
5.02. accent-text `#FF7D66` — 7.39 / 5.97. success `#4ADE80` 6.19 on its
composited bg / 8.59 on card; warning `#FBBF24` 9.39 / 8.97; danger
`#F87171` 5.78 / 5.41. All pass with margin.

Spot-checked against the live DOM (computed styles), the tokens are
what actually renders: body text `rgb(23,25,22)` on `rgb(243,240,231)`
light; `rgb(243,240,231)` on `rgb(18,20,17)` dark.

**The raw accent is not a text colour, and the system knows it:**
`#E44427` as text on bg-primary is 3.57:1 (fails AA normal text) — so
the tokens provide `--accent-text` (4.66) for text and `--accent-on`
(black, 5.15 on the accent) for labels on accent fills. White on the
accent would fail (4.07 light / 3.71 dark); `.btn-primary` was verified
in the live DOM to render **black** text on the vermilion fill, as
designed.

- **A11Y-01 (P3) — the one place the raw accent *is* used as small
  text:** the active bottom-nav label. Computed style in light theme:
  `rgb(228,68,39)` (raw vermilion) at 12 px / weight 600 on the bar's
  chalk background → **3.57:1, fails AA for normal text**. The dark
  equivalent passes (`rgb(235,78,48)` on graphite = 5.00:1), so the
  defect is light-theme-specific. State is redundantly conveyed (icon
  highlight + top indicator bar), which keeps this at P3; the fix is
  to use `--accent-text` for the active label in light mode.

## 2. Automated DOM probes (per screen, guest profile)

| Check | Today | Train/Coach | Fuel | Active workout |
|---|---|---|---|---|
| `<img>` without `alt` | 0 (0 img) | 0 | 0 (0 img) | 0 |
| Buttons without an accessible name | 0 / 60 | 0 / 22 | 0 | 0 |
| Inputs without label / aria-label | 0 / 0 | 0 / 1 | 0 / 3 | 0 |

- The app's iconography is inline SVG (hence zero `<img>` on Today and
  Fuel); every probed button carries text or an `aria-label`.
- **The single unnamed button in the app is the Training Tools sheet
  close (X)** — independently re-verified this round: opening the sheet
  (Train → Training Tools) yields 9 buttons, exactly 1 unnamed, outer
  HTML `p-2 min-h-[44px] min-w-[44px] flex …` (44×44 target, icon-only,
  no `aria-label`/`title`/text). This confirms Round 1b's **UI-1b-04**.
  Comparable sheet closes elsewhere carry `aria-label` (1b evidence) —
  this one is an omission, not a pattern.
- Landmarks on Today: `header` ×1, `nav` ×2, `main` ×1; a
  "Skip to main content" link exists and is the first Tab stop.
- Headings: no skipped levels on probed screens.
  **A11Y-05 (P3, semantics)** — Today's `h1` is the user's first name
  (the greeting line, e.g. "Audit"); the workout name is an `h2`.
  Harmless visually, but a screen-reader user navigating by headings
  hears their own name as the page title.

## 3. Keyboard & focus

- **Focus visibility: 100%.** Across 30 Tab stops on Today, 24 on
  Coach, and the sheet cycle, every focused element matched
  `:focus-visible` and rendered a solid 2 px outline (several also add
  a shadow). No stop landed on an invisible or off-screen element.
- **Order:** Today traversal follows the visual sequence for
  interactive elements — skip link → theme toggle → notifications →
  Change Today's Workout → Start/Resume → quick log → nutrition /
  protein details → quick actions → hydration ± → habit-matrix
  controls and day cells. Coach traversal is likewise monotonic.
  (Round 1b's UI-1b-06 — DOM order ≠ visual order on Today due to flex
  `order` — therefore affects *reading* order of non-interactive
  content for screen readers, not keyboard focus order; both halves
  are now evidenced.)
- **Modal behaviour (Training Tools sheet, `useModalA11y`):**
  `role="dialog"`, `aria-modal="true"`, `aria-labelledby` set; focus
  moves inside on open; Tab cycles within the sheet's 8 controls and
  wraps; **Esc closes**; **focus returns to the "Training Tools"
  trigger**. One imperfection —
  **A11Y-04 (P3) — focus passes through `document.body` for one stop
  per wrap cycle** before re-entering the sheet (the trap's redirect
  stop). A keyboard user perceives one "lost" Tab per cycle; focus is
  never surrendered to the page behind. Code coverage is broad:
  `useModalA11y` is used by 46 files.

## 4. Touch targets (bounding boxes, hit-test filtered, 390 px)

Primary actions are compliant throughout: `.btn-primary` 48 px,
segmented items ≥44 px, sheet close 44×44, tab-bar items in a 63 px
bar, workout steppers 44 px tall. Sub-44 targets concentrate in three
secondary patterns:

- **A11Y-02 (P3) — inline text-link buttons 14–16 px tall** (the
  recurring worst offenders): "Change Today's Workout" 154×14,
  "Already trained? Quick log…" 247×16 (Today); "Turn off coach tips"
  105×14, "Same as usual — go" 126×16, "Do it today" 66×16 (Coach);
  "Edit Target" 83×16 (Fuel); "Coach this plan" 87×14, "New Plan"
  73×16 (Train); tips-card "Got it" 49×20 (workout). These also fall
  below the WCAG 2.2 AA target-size floor of 24 px (2.5.8), which the
  app otherwise meets almost everywhere.
- **Chips at 24–38 px:** Fuel day-type chips 24 px tall (exactly at
  the 2.5.8 floor), diet-preference row 32, back button 34×34; Coach
  plan chips 77×30, sleep-rating chips 1–5 at ~33×30, note input and
  Send at 38; workout header icon buttons 36×44 and quick-adjust
  chips (±5 kg) 35×44 (height fine, width under).
- **Habit matrix (Today):** day-header cells 33×20 and day cells
  33×24 — a deliberately dense calendar grid; the 20 px header row is
  under the 24 px floor. In the probed viewport states, sub-44 counts:
  Today 4/22 (top region) and 38/52 (matrix region), Coach 15/23,
  Fuel 9/18, workout overlay 15/56 — dominated everywhere by the
  three patterns above, not by primary controls.

## 5. Text legibility & scaling

- **A11Y-03 (P3) — sub-floor text persists** (Round 1a F-04, carried):
  `text-[0.625rem]` (10 px) ×86 and `text-[0.5625rem]` (9 px) ×22 in
  source, under the system's own 11 px floor. At 9–10 px these labels
  are below comfortable reading size for many users regardless of
  contrast (the pairs involved pass §1's ratios).
- **The app's own text scaling works and is safe:** Settings → Text
  Size steps the root font-size (Large 112.5 %, Extra Large 125 %,
  `src/lib/text-scale.ts`). Verified end-to-end: setting Extra Large
  stored `textScale: 'xlarge'`, root computed size went 16 px → 20 px,
  and Today at 390 px still measured **0 px horizontal overflow, 0
  out-of-viewport elements**. Note the arbitrary-size utilities above
  are rem-based, so they scale with the setting too (per the
  text-scale.ts invariant comment).
- **Stress probe (beyond any app-supported mode):** forcing the root
  font-size to 200 % (32 px) at 390 px overflows Today by 173 px with
  6 out-of-viewport elements. Recorded for completeness; no user can
  reach this state through the app's settings (max 125 %).

## 6. Motion & screen-reader semantics

- **Reduced motion: honoured globally, verified live.** With
  `prefers-reduced-motion` emulated, `matchMedia` reports `reduce`
  and computed durations collapse (`.btn-primary` transition
  0.15 s → 0.01 ms) via the `globals.css` kill-switch
  (`animation/transition-duration: 0.01ms !important`). Code: the
  SMIL exercise demos additionally check `matchMedia` in
  `ExerciseDemo.tsx` before animating.
- **Live regions:** toasts render in an `aria-live="polite"` container;
  the offline banner is `role="status"` + `aria-live="polite"`; the
  coach chat list is `aria-live="polite"`. Code counts: `role="tab"`
  ×17 with `role="tablist"` ×6, `role="dialog"` ×9, `role="alert"` ×5,
  `role="switch"` ×5, `role="progressbar"` ×1.
- **A11Y-06 (P3, observation) — the rest timer has no live-region
  semantics.** No `aria-live` / `role="timer"` exists on the rest
  countdown (code sweep of `ActiveWorkoutScreen.tsx`); rest-end is
  signalled by chime + local notification (`rest-chime.ts`,
  `local-notifications.ts`) — audio/haptic channels a screen-reader
  user may not perceive as *information*. Whether the countdown's
  state changes are announced in a live set flow was **not** probed
  (no set was completed in this round's browser work); the code
  evidence says there is nothing to announce them with.

## 7. NOT TESTED

- **Real screen readers** (NVDA/JAWS/VoiceOver/TalkBack) — none
  available in this environment; all SR-relevant claims rest on DOM
  semantics and keyboard probes.
- Physical-device accessibility services, switch control, voice
  control, and OS font-scaling on a real phone (the app-setting and
  root-scaling probes in §5 are browser-level).
- Windows High Contrast / forced-colors mode; browser zoom above the
  §5 stress probe; braille output.
- Form Coach's analysis/summary screens (Round 1b covered the modal's
  upload state; its result screens were CODE-ONLY there and were not
  re-probed here).
