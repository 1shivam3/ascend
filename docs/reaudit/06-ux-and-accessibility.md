# Phase 6 — UX & Accessibility (Independent Re-Audit)

- **Tree:** `~/workspace/ascend-reaudit`, master `24a712a5`, Next.js 16.4.3 + React 19.3.1,
  bilingual en/hi, Tailwind.
- **Method:** static/code-level evidence only. i18n parity and the lint census are
  scripted hard numbers (methods stated inline). A11y results come from scripted
  greps/heuristics over `src/**/*.tsx` with manual classification of every flagged
  pattern family. No live browser was available to this phase — keyboard, screen-reader,
  zoom and viewport behaviour are listed under NOT TESTED, not inferred.
- **Coordinator gates (accepted as given):** tsc clean, lint 0 errors / 97 warnings,
  vitest 2336 pass / 20 known-infra failures, build PASS.

## Severity summary

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 1 |
| P3 | 5 |

Headline: the previously-fixed UX layer has held up. i18n parity is **perfect**
(2,958 / 2,958 keys), all product rules spot-checked pass, modals/images/buttons are
clean to within 2 buttons, and the remaining findings are announcements/localization
of system chrome rather than structural problems.

---

## 1. i18n parity (scripted)

Method: both dictionaries were transpiled in isolation (TypeScript compiler API,
CommonJS transpile of `src/lib/i18n/en.ts` / `hi.ts`) and the resulting objects
diffed programmatically — key sets, empty values, and `{placeholder}` sets per key.
Cross-checked with a TypeScript-AST object-literal property count and a line-level
key count; all three methods agree. Runtime behaviour: `translate()` in
`src/lib/i18n/index.ts` resolves hi → en → raw key, so any gap would degrade to
English, never to a raw key. Parity is also asserted by the repo's own
`tests/i18n.test.ts:76-84`.

| Metric | Result |
|---|---|
| Keys in `en` | **2,958** |
| Keys in `hi` | **2,958** |
| Keys missing in hi | **0** |
| Keys missing in en (hi-only) | **0** |
| Empty values, en | **0** |
| Empty values, hi | **0** |
| Duplicate keys, either dictionary | **0** |
| `{placeholder}` set mismatches (en vs hi, same key) | **0** |
| Values byte-identical en = hi | 8 — all legitimate (see below) |
| hi values containing zero Devanagari characters | 9 — all format strings / proper nouns |

The 8 identical values: `language.hindi` = "हिंदी" (endonym, correct in both),
`toast.titleApp` = "ASCEND", `run.programName` = "Couch to 5K" (program name),
`prs.oneRmPr` / `take.oneRmPr` = "1RM PR", and three placeholder-only format strings
(`prs.historyCountOne`, `prs.toastPrDetail`, `coachBlock.scheduleLine`). None is an
untranslated UI sentence. **No finding — parity is complete, including
interpolation placeholders.**

Caveat on quality, not coverage: dictionary *coverage* is machine-verified;
translation *quality* is not (several strings in the tree are self-flagged in
comments as awaiting native-speaker review, e.g. the coach-chat Hindi set from
PR #59). Native review remains a human task — see NOT TESTED.

---

## 2. Static accessibility scan (scripted greps + manual classification)

### 2.1 Images without alt — 0 real issues

7 `<img>` elements exist in `src/` (no `next/image` anywhere). All 7 carry `alt`:

| File:line | alt |
|---|---|
| `src/components/EditProfileModal.tsx:270` | `t('editProfile.profileAlt')` |
| `src/components/ProfileView.tsx:177` | `t('profile.title')` |
| `src/components/ProgressPage.tsx:1710` | template: "Progress photo from {date}" |
| `src/components/ScanMealModal.tsx:904` | `t('scan.mealPreviewAlt')` |
| `src/components/ShareProgramModal.tsx:221` | `t('share.qrAlt')` |
| `src/components/WeeklyRecapModal.tsx:403` | `t('recap.previewAlt')` |
| `src/components/WorkoutDetailsView.tsx:143` | "Workout hero photograph" (hardcoded English — trivial, decorative hero) |

### 2.2 Buttons without an accessible name — 2 real issues out of 757

Heuristic: every `<button>…</button>` block in `src/**/*.tsx` was parsed; a button
was flagged if its text content (tags stripped) is empty **and** its opening tag has
no `aria-label`, `aria-labelledby`, or `title`. Corpus: **757 button blocks**,
275 `aria-label` occurrences across the tree.

- **Flagged: 2** — UX-R2 below. Everything else icon-only is named (e.g. the shared
  Sheet close button carries `aria-label={t('common.close')}`,
  `src/components/ui/Sheet.tsx`).

### 2.3 onClick on non-interactive elements — 0 real issues in the modal pattern; 1 real elsewhere

56 same-line `<div|span|li|p|section|article … onClick>` hits, classified:

- **44 = modal backdrop click-to-dismiss.** The dialog itself is **not** the
  backdrop: the inner container receives `dialogProps` from `useModalA11y`
  (`src/lib/use-modal-a11y.ts`) = `role="dialog"`, `aria-modal`, `tabIndex={-1}`,
  focus moved in on open, Tab trapped, **Escape closes**, focus restored on close
  (hook header, `src/lib/use-modal-a11y.ts:10-14,303-317`). Backdrop click is a
  pointer convenience layered on a fully keyboard-operable dialog — false positive.
- **12 = `onClick={(e) => e.stopPropagation()}`** on modal content — not an
  activation handler at all. False positive.
- The 6 `role="button"` clickable cards found separately (e.g.
  `src/components/HomePage.tsx:745,770`, `src/components/ActiveWorkoutScreen.tsx:2177`)
  all carry `tabIndex={0}`, Enter/Space `onKeyDown` handlers, and (on the cards)
  `aria-label` — correct pattern. False positives.
- **1 real issue:** the offline banner — UX-R3 below.

### 2.4 Landmarks, lang, focus, live regions

- **Skip link:** present in `src/app/layout.tsx:113-119`
  (`sr-only focus:not-sr-only …` → `#main-content`; `main` carries
  `id="main-content"` in `src/app/page.tsx`).
- **Focus visibility:** global, deliberate, and documented —
  `src/app/globals.css:154-159` (`button/a/[role=button]/[role=switch]:focus-visible`
  → 2 px accent outline) plus an unlayered catch-all `:focus-visible` rule at
  `globals.css:481-483` written specifically to beat Tailwind `outline-none` sites.
  `prefers-reduced-motion: reduce` block exists (`globals.css:440`).
- **Pinch zoom is intentionally enabled** (`src/app/layout.tsx:84-93`, with a comment
  naming the WCAG reason) — no `maximumScale`/`userScalable` lockout.
- **Type floor:** the old 10 px size was removed in the redesign; `text-2xs` is now
  0.6875 rem / 11 px (`tailwind.config.js:96-99`).
- **Live regions:** toast container `aria-live="polite"`
  (`src/components/ui/Toast.tsx:86`); sync chip `role="status"` +
  `aria-live="polite"` (`src/app/page.tsx:473-474`); sync-failure banner
  `role="alert"` (`src/components/SyncErrorBanner.tsx`, Phase 7 §3); SW update
  banner `role="status"` (`src/components/ServiceWorkerRegister.tsx`). The one
  surface with **no** live region is the new coach chat — UX-R1.
- **`<html lang>`:** static `lang="en"` in the prerendered shell
  (`src/app/layout.tsx:101`), corrected client-side when the stored language is
  Hindi (`src/app/page.tsx:233`: `document.documentElement.lang = … 'hi'`). UX-R5.
- **Dark mode parity (structural):** the light `:root` block and the
  `.dark, :root[data-theme='dark']` block in `src/app/globals.css:5-110` define
  exactly the same **42 custom properties each — 0 light-only, 0 dark-only**
  (scripted set diff). Contrast annotations in the token comments show prior
  deliberate fixes (muted text darkened to 4.7:1 on chalk; `--accent-on` corrected
  per-mode). Rendered contrast in a browser remains NOT TESTED.

### Findings

**UX-R1 (P2) — Coach chat replies, "thinking" state, and errors are not announced
to assistive technology.** `src/components/CoachChatSection.tsx` contains no
`aria-live`, `role="status"`, or `role="alert"` anywhere (grep: 0 hits). The message
list (lines 293-313), the `coachChat.sending` "Thinking…" indicator (line 313), and
the three error paragraphs (lines 316-318) are plain `<p>` elements. A screen-reader
user can send a message and receives no announcement that a reply arrived, that the
coach is thinking, or that an error occurred — in the app's newest flagship surface.
Every other async surface in the app does announce (toasts, sync banner, SW banner).
Fix shape: `aria-live="polite"` on the transcript container (or a visually-hidden
status node) and `role="alert"` on the error paragraphs.

**UX-R2 (P3) — Heatmap month-navigation buttons have no accessible name.**
`src/components/WorkoutHeatmap.tsx` — the prev/next month buttons (onClick at
lines 214 and 221) contain only `<ChevronLeft/>` / `<ChevronRight/>` and no
`aria-label` or `title`. A screen reader announces two unnamed "button"s.
(The adjacent view-mode toggle buttons do carry `title`, e.g. line ~208.)

**UX-R3 (P3) — Offline banner is pointer-only.** `src/app/page.tsx:471-485`: an
`<aside role="status" aria-live="polite" onClick={…}>` with `cursor-pointer` opens
the offline-details modal, but it has no `tabIndex`, no key handler, and is not a
button/link — keyboard users cannot open those details. (The banner's *information*
is announced via the live region; only the drill-in action is unreachable.)

**UX-R4 (P3) — System chrome strings bypass i18n (hardcoded English).**
Three surfaces render English regardless of the selected language:
- SW update banner: "New version available" / "Refresh" /
  `aria-label="Dismiss update notice"`
  (`src/components/ServiceWorkerRegister.tsx:135,~141,146`);
- offline banner: "Offline Gym Mode Active • Tap for details"
  (`src/app/page.tsx:479`);
- skip link: "Skip to main content" (`src/app/layout.tsx:117`).
A Hindi-mode user meets English exactly at system moments (update ready, offline).
The component comment in `ServiceWorkerRegister.tsx` explains the banner is
hand-rolled because it renders outside `ToastProvider` — but `useTranslation` does
not depend on the toast provider, so the bypass is not forced.

**UX-R5 (P3) — Prerendered `<html lang="en">` for Hindi users until hydration.**
`src/app/layout.tsx:101` hardcodes `lang="en"`. The SPA root corrects it
post-hydration (`src/app/page.tsx:233`), but (a) the static HTML served for every
route declares the wrong language to first-parse AT and crawlers, and (b) routes
outside the SPA shell (`/privacy`, `/terms`, `/delete-account`, `/disclaimer` —
separate route segments under the same layout) never run that effect, so their
`lang` stays `en` even for a Hindi-preference user. Impact is modest because those
legal pages are English-only documents, but the shell-level mismatch is real.

**UX-R6 (P3, owner decision) — The word "Supabase" appears in user-visible legal /
account-deletion copy — but NOT in sign-in.** Scoped check against the standing
rule ("sign-in must never expose Supabase"):
- Sign-in flow: **zero**. `AuthModal.tsx` mentions Supabase only in an import, a
  hook name, and code comments; every rendered string is an i18n key
  (`auth.continueGoogle`, `auth.cloudAccount`, …).
- App-wide: 145 `Supabase` matches in `src/`, overwhelmingly identifiers/comments/
  server code. The user-visible rendered exceptions are legal/disclosure copy:
  `src/app/privacy/page.tsx:87,90,150,171` and `src/app/terms/page.tsx:115`
  (naming the sync database/processor), and the account-deletion dictionary value
  `del.identityBody` ("…authentication credentials in Supabase Auth.",
  `src/lib/i18n/en.ts:2060`; hi `hi.ts:2064`).
Naming a data processor in a privacy policy is normally *required* disclosure, so
this is flagged for an owner call rather than scored as a rule violation: the
sign-in rule itself passes cleanly.

---

## 3. Product-rule compliance spot checks

| Standing rule | Verdict | Evidence |
|---|---|---|
| Week = Mon–Sun | **PASS** | Single helper family: `getMondayOfWeek` (`src/lib/formatters.ts:240-250`, `(day + 6) % 7`); the same `(getDay() + 6) % 7` Monday-index arithmetic is used consistently in `athlete-model.ts:230,643`, `coach-engine.ts:1150,1174`, `coach-i18n.ts:117`; coach-chat system prompt states it (`src/lib/coach-chat.ts:412`). `WEEKDAYS` in `en.ts:3053` is Monday-first in both languages; heatmap/matrix consume the same helpers. No Sunday-start code found. |
| Train tab shows ONLY user plans | **PASS** | Train = `src/components/WorkoutPage.tsx`, sub-tabs Plans \| Coach \| History (tablist at line 2148, with arrow-key handling). Plans section is explicitly scoped — comment at line 2178-2180 ("user plans only — pre-made templates were [removed]"), section headed `train.yourPlans` (line 2241), and line 1970-1971: "The active routine is always one of the USER's own plans (QA4-023: Train shows user plans only; no template surfaces remain here)." No template/pre-made plan rendering found in the tab. |
| Sign-in never exposes "Supabase" | **PASS** (for sign-in; see UX-R6 for legal copy) | §2, UX-R6. |
| SUPPORT_EMAIL single source | **PASS** | Defined once: `src/lib/legal.ts:11` (`export const SUPPORT_EMAIL = 'shivamvats744@gmail.com'` — the recorded temporary personal address), consumed by `privacy/page.tsx:18,174,217`, `terms/page.tsx:4,175`, `DeleteAccountView.tsx:22,231,245,456,635`. Scripted sweep for email literals across `src/` outside `legal.ts` (gmail/support@ patterns): **0 hardcoded addresses**. |
| Minimal-by-default UI | **PASS (code level)** | Fresh stores default `density: 'simple'` (`src/lib/store.ts:250-253`); the Simple Today order is a named constant matching the owner's list — workout, nutrition, protein, quick actions, hydration, habits, quote last (`src/lib/today-layout.ts:48-54,170-191`). Pre-redesign stored blobs migrate to Detailed by design (existing users keep their layout); new users get Simple. |
| Dark mode at light-mode quality | **PASS (structural)** | 42/42 design-token parity between modes (§2.4); per-mode contrast-corrected tokens. Visual pass NOT TESTED. |
| Every feature/setting findable | **PASS (spot check)** | Settings surface is large and fully i18n-labelled: 187 `settings.*` keys, 136 `t('settings.…')` call sites in `SettingsView.tsx` alone. Full task-based findability testing is a live exercise — NOT TESTED. |

---

## 4. Lint warning census (scripted, sums to the 97 baseline)

Method: `eslint . -f json` re-run in this tree (output to `/tmp/reaudit-lint.json`,
outside `src/`), messages grouped by `ruleId`. The re-run reproduced the
coordinator's baseline **exactly: 97 warnings, 0 errors, spread over 38 files** —
and matches `/tmp/reaudit-lint.log`'s footer (`✖ 97 problems (0 errors, 97 warnings)`).

| Rule | Count | Share | Reading |
|---|---|---|---|
| `react-hooks/set-state-in-effect` | 42 | 43.3% | React-Compiler-era warning: synchronous `setState` in effect bodies (cascading-render risk). Mostly store/hydration sync patterns — a perf-hygiene backlog, not user-visible defects per se. |
| `react-hooks/preserve-manual-memoization` | 17 | 17.5% | Manual `useMemo`/`useCallback` the compiler cannot preserve; memoization may be dropped under the compiler. |
| `react-hooks/exhaustive-deps` | 15 | 15.5% | Missing/unnecessary hook deps; the recurring missing dep is `t` (the translation function) across pages. |
| `react-hooks/immutability` | 6 | 6.2% | Values treated as immutable being modified (compiler rules). |
| `react-hooks/refs` | 6 | 6.2% | Ref reads/writes during render (compiler rules). |
| `@next/next/no-location-assign-relative-destination` | 6 | 6.2% | All 6 are **deliberate hard-reload recovery navigations** — `src/app/error.tsx:25`, `src/components/ErrorState.tsx:41,50`, `src/app/page.tsx:317,320,340` — where a full reload is the recovery mechanism. Classified intentional, not debt. |
| `react-hooks/purity` | 5 | 5.2% | Impure expressions during render (compiler rules). |
| **Total** | **97** | 100% | 91 of 97 (93.8%) are the React Compiler `react-hooks/*` family; 0 are a11y rules (no `jsx-a11y` ruleset is producing warnings), 0 are correctness errors. |

Hottest files: `ActiveWorkoutScreen.tsx` 18, `MealsPage.tsx` 12, `app/page.tsx` 6,
`WorkoutPage.tsx` 6, `lib/navigation.tsx` 5, `RunSessionScreen.tsx` 4 — the warning
mass sits in the largest interactive surfaces, as expected. Nothing in the census
contradicts the coordinator's gates; the UX-relevant takeaway is that the 42
`set-state-in-effect` sites are the one family with a plausible (unmeasured) runtime
cost — see Phase 7, PERF-O2.

---

## 5. Coach chat section UX (PR #59) — `src/components/CoachChatSection.tsx` (347 lines)

Rendered inside Train → Coach (`src/components/WorkoutPage.tsx:2901`), as a section,
not the removed drawer (component header, lines 36-46, states this explicitly).

| Aspect | State | Evidence |
|---|---|---|
| Section labelling | ✅ | `<section aria-label={t('coachChat.sectionAria')}>` ("Coach chat" / "कोच चैट"), visible `<h2>` title `coachChat.title` ("COACH CHAT" / "कोच चैट"), subtitle explains answers are based on the user's own data (line 281-286). |
| Input label | ✅ (with a wart) | The text input carries `aria-label={t('coachChat.placeholder')}` (line 334) — labelled in both languages, but the label **is** the placeholder sentence "Ask about your training…" / "अपनी ट्रेनिंग के बारे में पूछें…". Functional, though a dedicated short label would be cleaner. No visible `<label>` element. |
| Send button naming | ✅ | Real `<button>` with visible text `t('coachChat.send')` ("Send" / "भेजें") — no icon-only ambiguity (lines 336-344). |
| Pending/thinking state | ⚠️ visual only | `sending` state disables the button, disables duplicate sends (`if (!text || sending) return`, line 230), disables send on empty input, and shows `coachChat.sending` ("Thinking…" / "सोच रहे हैं…", line 313). But nothing is announced (UX-R1) and there is no spinner/`aria-busy`. |
| Remaining-messages indicator | ✅ | `dailyLeft` from the server response renders `coachChat.dailyLeft` — "{n} messages left today" / "आज {n} संदेश बाकी हैं" (lines 319-321). Only shown once a count is known (`dailyLeft !== null`), so there is no pre-first-message quota display. |
| Error copy | ✅ copy / ⚠️ announcement | Three distinct, honest errors, all bilingual: generic `errorGeneric` ("Could not reach your coach. Try again."), cap `errorCap` ("You have reached today's chat limit. Come back tomorrow."), rate `errorRateLimit` ("Too many messages too fast…") — mapped from server codes (lines 255, 316-318). A failed send also injects the generic error as an assistant message (line 266). Errors are plain red `<p>`s — no `role="alert"` (UX-R1). |
| Message attribution & evidence | ✅ | Each message is headed You/Coach (`coachChat.you` / `coachChat.coach`); assistant replies show up to 4 "Based on your data:" evidence lines (lines 296-311) — the honesty contract is visible in the UX, not just the prompt. |
| Cold start | ✅ | With no training history, a card says so plainly (`coachChat.coldStart`, line 289-291) instead of faking personalization. |
| Input limits | ✅ | `maxLength={2000}` matches the server-side 2,000-char message cap; Enter sends (lines 327-330). No character counter — acceptable at this cap. |
| i18n | ✅ | All **67 `coachChat.*` keys exist in both dictionaries** (§1 scripted diff; 0 missing, 0 placeholder mismatches). Note the standing flag from the merge record: the Hindi coach-chat strings shipped without native-speaker review — a quality-review debt, not a parity gap. |
| Scroll behaviour | ✅ | Transcript auto-scrolls to the newest message (`listRef.scrollTo`, lines 275-278); container is `max-h-80 overflow-y-auto`. Keyboard/screen-reader behaviour of that scroll region NOT TESTED. |

Net: a well-built section on naming, limits, quota visibility, and error copy —
its single material gap is the missing live region (UX-R1, P2).

---

## NOT TESTED (live-only — no browser/device in this phase)

- Keyboard-only pass through the app (tab order, focus visibility in practice,
  modal trapping, tablist arrow keys) — code patterns verified, behaviour not exercised.
- Screen-reader pass (NVDA/VoiceOver/TalkBack): announcements, dialog naming,
  chat live-region behaviour (UX-R1 is a code-level certainty; its user impact
  wording assumes standard AT behaviour).
- True mobile viewport rendering, touch-target sizes in situ, and 200% zoom /
  text-scaling reflow (zoom is uncapped by design — `layout.tsx:84-93`).
- Rendered colour contrast in either theme (token values and prior contrast
  annotations were read; no rendered measurement was possible).
- Hindi translation *quality* (native-speaker review) — parity and placeholders
  are scripted-verified; fluency is not assessed here.
- Task-based findability ("can a normal user find setting X") and the Simple vs
  Detailed Today layouts as rendered.
- Capacitor/Android rendering of any of the above.
