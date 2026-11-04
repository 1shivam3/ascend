# Device & Responsive Compatibility — ASCEND Final Certification, Round 1c-2

- **Build audited:** master `62e25543` (BUILD_ID `y8oQPLBPS4oYLZKgQHz5p`),
  local production build (`npm run build`, `next start`) — the same
  substitution Rounds 1b/1b-2 used, for the same reason (production is
  unreachable from this sandbox's Chromium). Source commit is identical to
  production; the production SW cache name was re-verified separately
  (`ascend-62e2554-cache`, see performance-audit.md).
- **EMULATION ONLY.** Every result below is headless Chromium
  (chrome-headless-shell 152.0.7977.30) viewport emulation. **No physical
  device was used.** Nothing in this document is a real-device result.
- **Method.** Four probe runs over fresh/onboarded guest profiles. Overflow
  is *measured*, not eyeballed: `documentElement.scrollWidth − innerWidth`
  plus a per-element bounding-box sweep (elements extending past the
  viewport, excluding contained horizontal scrollers). Truncation is only
  counted as a defect when the element also passes a hit test
  (`elementFromPoint` at its centre) — the app keeps screens mounted, so
  naive DOM sweeps report covered screens' elements; an early run's counts
  were contaminated that way and were discarded. Final numbers come from
  runs where the active screen was verified (active-tab class + content
  markers + hit tests) at every step.
- Screens covered: Today, Train, Coach, active workout, Fuel, Settings.

## 1. Viewport matrix — horizontal overflow

Widths (px): 320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1440
(heights 568–1024, phone-like below 768, desktop-like above).

| Screen | 320 | 360 | 375 | 390 | 412 | 430 | 768 | 1024 | 1280 | 1440 |
|---|---|---|---|---|---|---|---|---|---|---|
| Today | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Train | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Coach | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Active workout | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Fuel | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Settings | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Cell value = horizontal overflow in px (`scrollWidth − innerWidth`);
the per-element sweep also found **0 out-of-viewport elements in every
cell** (60/60 screen-states). **No core screen overflows horizontally at
any tested width. No P1/P2 responsive defect exists in this build.**

- **Bottom navigation:** the tab bar is 63 px tall, in-flow at the bottom
  of the 100dvh shell, present at widths ≤768 px; at ≥1024 px it is
  replaced by the desktop sidebar (bar height 0, content offset
  `lg:ml-[232px]`). It was reachable and operable at every width (all
  screen transitions in the matrix were driven through it).
- **Sticky elements:** the workout session header and the Today greeting
  row remain usable at 320 px (screenshot-verified); no sticky element
  was observed covering content in any measured state. Page bottom
  clearance is structural (`.page` padding-bottom
  `calc(76px + env(safe-area-inset-bottom))`).

## 2. Truncation (hit-test verified — visible truncation only)

Visible truncations on Today / Train / Coach / Fuel / Settings: **none at
any width.** The only clipped text the sweep finds on those screens is
the "Skip to main content" link (1 px visually-hidden pattern, working as
intended) and elements of other, covered screens that stay mounted —
both verified non-visible by hit test and therefore not defects.

On the **active workout** screen, two real truncations occur at phone
widths:

- **DEV-1 (P3) — "Gym packed?" explainer is ellipsized at every phone
  width.** The line "Pre-swap to dumbbell & bodyweight moves you can do
  anywhere." needs 363 px; available width is 272 px @360, 287 @375,
  302 @390, 324 @412, 342 @430 — it is cut mid-word at all of them
  (screenshot-verified at 320: "Pre-swap to dumbbell & bodyweight mo…").
  The full sentence renders at ≥768 px and in landscape (§5). The toggle
  itself and its "Gym packed?" label are unaffected; only the
  explanation of what the toggle does is clipped, and it has no
  `title`/expand affordance.
- **DEV-2 (P3) — workout header title is squeezed at 320 px.** The
  session header fits seven controls (close, pause, finish, form cues,
  warm-up, tools, plus title); at 320 px the workout name compresses to
  "U…" (screenshot). The element carries a `title` attribute with the
  full name, and every control remains visible and tappable. At
  ≥360 px the title renders fully. Related cosmetic wrap at 320 px:
  the "SET 1 OF 3" label wraps to three lines beside the set chips.

## 3. Safe areas / notch (code-level + what emulation can show)

- `viewportFit: 'cover'` is set (`src/app/layout.tsx:91`), so the app
  does draw under notches in standalone mode and must pad for them.
- Bottom inset is handled in four places: `.native-tab-bar`
  (`max(0.5rem, env(safe-area-inset-bottom))`), `.page`
  (`calc(76px + env(safe-area-inset-bottom, 1rem))`), `.page-bottom-safe`
  (with a comment describing the exact failure it prevents), and
  `.modal-content` (`pb-[max(env(safe-area-inset-bottom),1.25rem)]`).
- **DEV-3 (P3, code observation) — no `safe-area-inset-top` (or
  left/right) anywhere in `src/`.** Top clearance relies on the in-flow
  layout starting below the browser chrome. Headless emulation cannot
  render a notch, so whether the greeting/header clears a real device's
  camera cutout in installed-PWA mode is **NOT VERIFIED** — it needs a
  physical notched device.

## 4. PWA behaviour (from code + served manifest)

- `public/manifest.json`: `id com.ascend.training`, name
  "ASCEND: Strength and Food Log", `short_name ASCEND`,
  `display: standalone` (with `display_override` incl.
  window-controls-overlay), `orientation: portrait`,
  `start_url /`, `scope /`, icons: SVG (any), 192 png, 512 png,
  512 maskable png. Installability criteria are all present
  (manifest + registered service worker + 192/512 icons).
- **Brand split (cross-ref Round 1a):** manifest `theme_color` and
  `background_color` are graphite `#171916`; the shipped icon
  (`public/icon.svg`) is logo orange `#FF6B1F`; the in-app accent token
  is vermilion `#E44427`. Three different brand colours greet the user
  at install, splash, and first open respectively. Recorded as a
  consistency observation; no functional impact.
- The service worker precaches **33 shell entries** (routes, icons, the
  build's critical chunks — generated by `scripts/generate-sw.js`); the
  MediaPipe payload is **not** precached (see performance-audit.md).
  Offline *behaviour* of the production SW was Round 1b-2's F9 and is
  not re-tested here.

## 5. Rotation — landscape probe (844×390, EMULATION)

- Today: 0 px overflow, 0 out-of-viewport elements; document height
  1,307 px (the column scrolls vertically; bottom bar present, 63 px).
- Active workout: opens and measures 0 px overflow (document height
  1,651 px, scrolls). At 844 px wide the session title renders in full
  and the "Gym packed?" sentence renders **complete** — confirming
  DEV-1/DEV-2 are phone-portrait-width phenomena only.
- The manifest declares `orientation: portrait`, but nothing locks the
  web app in a browser tab; landscape is usable where it occurs.

## 6. NOT TESTED

- **Real devices of any kind** — no phone, tablet, or desktop with a
  real GPU/touch digitizer was used; all results are emulation.
- Notched/punch-hole hardware behaviour (DEV-3) — needs hardware.
- iOS Safari / any WebKit engine — this sandbox has Chromium only;
  iOS PWA quirks (100dvh behaviour, safe-area reporting, SW limits)
  are unverified.
- The Capacitor Android shell (in-repo `android/` project) — out of
  scope for this round; the audited product is the web app.
- Foldables, split-screen/multi-window resizing, and browser-chrome
  show/hide scroll dynamics on real mobile browsers.
- Touch *feel* (scroll inertia, tap latency) — not measurable headless.
