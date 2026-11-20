# Bug-Fix Program Phase 7 — Persona Pass Report

**Branch:** `bug-program/phase-7` (from master `2e706bb`, Phases 0–6 merged as PRs #135–#142)
**Scope:** the brief's Phase 7 — seven personas driven end-to-end in Playwright (android-360x740, touch), production build served locally, seeded from `qa/fixtures/personas.ts`, plus two supporting runs (Vikram, Screen-reader) carried over from the QA-hardening suite because they hold the F4-3/F4-4 and accessibility evidence. This report supersedes the QA-hardening Phase 4 edition of this file (preserved in git history); prior finding ids (F4-x) are reused so closures can be tracked.
**Rules honored:** harness AI mocks only; no real account or production backend touched; the persona drives measure the app as shipped — the only code changed in this phase is QA harness code (disclosed below), plus this report.

## Harness repairs (disclosed, test-infrastructure only)

The persona suite predates two product changes and could not run as written. Both repairs are in the harness, not the app:

1. **`setTheme` vs §35** (`qa/fixtures/helpers.ts`): the helper patched the persisted store's `theme` field; since the state-machines program (§35) only `themeMode` persists and the resolved theme is re-derived on load, dark screenshots silently came back light. The helper now sets the mode (`ascend_theme_mode` + `blob.state.themeMode`) — the app follows the persisted mode correctly.
2. **Today's workout entry** (`qa/fixtures/persona-run.ts`, `qa/e2e/personas/sana.spec.ts`): the drives tapped Today's "Start Workout" to reach Train. On a rest day the card now offers "Train anyway", which opens the Change-Today's-Workout sheet (see finding P7-1) — the working entry is the Train tab, which is what the drives now use on rest days. The Hindi persona drive already used the Train-tab path and passed unchanged.

## Results by persona

Outcomes use the brief's scale: **yes** / **with difficulty** / **no**. Seconds are VM-inflated; read them as relative.

| Persona (brief) | Harness seed | Taps | Steps yes / difficulty / no | Verdict |
|---|---|---|---|---|
| Rohan, 19, guest | intermediate | 47 | 4 / 1 / 0 | Pass with friction (F4-7) |
| Priya, 27, Hindi | hindi | 46 | 6 / 0 / 1 not-testable (voice) | Pass |
| Arjun, 32, advanced* | empty-guest → onboarding | 53 | 4 / 2 / 0 | Pass with friction (F4-5, F4-7) |
| Meera, 45, XL text* | advanced view + xl seeds | 38 | 5 / 0 / 0 | Pass |
| Aman, 16, safety | minor-15 | 7 + 5 | 3 + 0 / 1 difficulty / 0 | Pass (F4-6 copy gap) |
| Sana, offline / two-device | intermediate | 55 | 9 / 0 / 1 not-tested (cloud sync) | **Pass — F4-1 and F4-2 FIXED** |
| Dev, adversarial | intermediate | 124 | 9 / 0 / 0 | Pass — no corruption found |
| Vikram, injuries (supporting) | injuries | 22 | 7 / 0 / 1 not-testable (coach context) | **Pass — F4-3 and F4-4 FIXED** |
| Screen-reader (supporting) | intermediate | 7 + 18 | 9 / 0 / 0 | Pass (Chromium tree only) |

\* The brief's names/ages are personas to embody; the harness's Arjun drive is the fresh-onboarding journey and its Meera drive is the Advanced-view journey, with XL text covered by the Phase 6 r8/r14 evidence (Complete bar reachable at 320×568 with XL text, no truncation failures). The mapping is stated rather than silently renamed.

### Persona notes

- **Rohan** — full core loop: start suggested workout, log every set, finish (history 18 → 19 asserted), typed meal logged, protein target (162 g) findable on Fuel. Only friction: F4-7.
- **Priya** — Hindi Today/nav, Hindi quick-log of an Indian meal, protein vs target in Hindi, full workout start/log/finish through Hindi labels — all yes. Voice logging NOT TESTABLE (no microphone in the harness).
- **Arjun** — guest onboarding completes; the plan offer can be declined; first workout logged and saved (0 → 1). Frictions: F4-5 (silent Continue gate), F4-7.
- **Meera** — Progress shows all seeded PRs with estimated 1RMs; View All complete; Advanced-view session started, every set logged via row toggles, finished with the saved session asserted set-complete.
- **Aman** — target is maintenance-level (1,806 kcal) and labelled an estimate; creatine hidden; a mocked coach action proposing 1,200 kcal cannot apply. Under-13 DOB still cannot be entered — and still silently (F4-6).
- **Sana** — the reversal of the last report: cold offline Train opens work in light **and** dark; offline relaunch renders the app; the warm offline journey (start, log, finish, meal) completes; reconnect leaves all data intact. Cloud sync NOT TESTED (no backend in the harness; the sync engine itself is covered by the Phase 6 suites).
- **Dev** — 9/9, identical to the last pass: hostile meal text, stepper floors/caps, double-tap logs exactly one set, kill-and-recover draft, PR recompute + Undo, two-tab consistency. No corruption found.
- **Vikram** — declared Knee + Low back limitations are now respected on the generator path (light + dark), the session opens on a knee-safe exercise, and the "Hurts" swap completes. Coach context remains code-verified only.

## Findings

### New in this pass

**P7-1 — MEDIUM — Today's rest-day card is a dead end for plan-less users (onboarding/core).**
On a rest day, Today's "Train anyway" opens the Change-Today's-Workout sheet. For a user with no workout plans the sheet says "No workout plans available" and offers only "Set today as Rest Day (Recovery)" and Manage Plans — there is no way to start training from Today, although the Train tab's Suggested Workout would generate a session immediately. A returning user whose plan lapsed hits exactly this. Workaround: the Train tab. Evidence: probe screenshots `qa/screenshots/personas/p7-1/rest-day-card.png`, `qa/screenshots/personas/p7-1/change-workout-sheet.png` (probe spec removed after diagnosis; the persona drives now route via the Train tab and note this finding).

### Prior findings — status after this pass

| Finding | Was | Now |
|---|---|---|
| F4-1 cold offline tab crash (High) | Open | **FIXED** — Sana cold opens pass, light + dark |
| F4-2 offline relaunch fails (High) | Open | **FIXED** — Sana relaunch step passes |
| F4-3 generator ignores declared injuries (High) | Open | **FIXED** — Vikram 7/7 testable steps; generator routes through the limitations pipeline |
| F4-4 "Hurts" swap dead end (Medium) | Open | **FIXED** — Vikram swap step passes |
| F4-5 onboarding Continue gate silent (Low) | Open | Still open — Arjun difficulty, unchanged |
| F4-6 under-13 block silent (Low) | Open | Still open — Aman difficulty, unchanged |
| F4-7 plan-editor gate before first set (Low) | Open | Still open — Rohan + Arjun difficulty, unchanged |

## Scores

Anchors (brief): 3 = broken · 5 = friction · 7 = good · 9 = best-in-class; no rounding up. Caps applied mechanically: an open Critical caps its dimension at 5, an open High at 7, any open data-loss/wrong-target issue caps the overall at 6. **No cap is triggered in this pass** (no open High or Critical; no data-loss issue — Dev and Sana prove the opposite).

| Dimension | Weight | Score | Evidence (≥2) | What raises it by one point |
|---|---|---|---|---|
| Core logging | 25% | **8** | Rohan + Arjun + Priya + Meera complete full sessions in Simple and Advanced views, English and Hindi; double-tap integrity (Dev) | Remove the plan-editor gate (F4-7) and the Today rest-day dead end (P7-1) |
| Data integrity | 15% | **8** | Dev 9/9 (kill-recover, derived-PR recompute, Undo, two-tab); Sana reconnect with data intact; Phase 6 sync suites (newest-wins, tombstones) | A verified two-device cloud round trip (still NOT TESTED here) |
| Nutrition | 15% | **8** | Priya/Rohan quick-log + target readability in both languages; Phase 3's DB-verification (unverified numbers can no longer display as verified; FOOD_TEST_SET drift guard in the build) | A real-device scan of a real thali confirming computed confidence end-to-end |
| Onboarding | 10% | **6** | Arjun completes guest onboarding end-to-end; Aman under-13 cannot be entered; F4-5's silent gate and P7-1's plan-less dead end remain | A hint at the Continue gate (F4-5) and a training path in the rest-day sheet (P7-1) |
| Visual | 10% | **7** | Phase 6: WCAG AA contrast for all presets + random customs in both themes; truncation sweeps at 320/360/412 incl. XL; persona screenshots consistent light/dark | A production-build visual pass on a real phone (notch, safe areas) |
| Accessibility | 10% | **8** | Screen-reader 9/9 (every interactive element named on 7 surfaces, dialog focus, keyboard order, live regions); Phase 6 r8 tap-target + Complete-bar reachability | A real TalkBack pass confirming announcement content, not just tree structure |
| Offline / performance | 10% | **8** | Sana: cold opens, offline relaunch, full warm offline journey — the previous edition's two High defects are closed | Production service-worker behaviour verified on the real deploy (device checklist 1–2) |
| Safety | 5% | **8** | Aman: maintenance-only minor targets, creatine hidden, deficit coach action cannot apply; Vikram: declared limitations now honored on every generation path | Copy for the under-13 block (F4-6) so the refusal explains itself |

**Weighted overall: 7.7 / 10** (2.00 + 1.20 + 1.20 + 0.60 + 0.70 + 0.80 + 0.80 + 0.40). Previous edition: 7.2 / 10 on a slightly different weighting (it carried a 5% differentiation dimension this brief does not score).

## Release verdict

**Ship.** The two headline promises that gated the previous verdict — "works offline" and "respects your injuries" — now hold on the exact drives that exposed them, and the bug program's recorded defects (Phases 1–6) each carry a failing-before/passing-after test. What remains open is friction, not correctness: F4-5, F4-6, F4-7 (all Low) and P7-1 (Medium, with a one-tap workaround). Recommended next fixes in order: P7-1, F4-7, F4-5/F4-6 (one copy change each).

## Confidence statement

**Tested:** seven brief personas + two supporting drives (11 Playwright tests, ~480 recorded taps) on a local production build of master `2e706bb` at 360×740 with touch emulation, light + dark, English + Hindi, offline toggles, and store-level assertions after nearly every journey; Phase 6's 39-file/432-test battery and Playwright set re-verified on the same master line.
**Mocked:** every AI endpoint (coach chat, takes, meal parse/scan, voice parse) — AI quality is not assessed, only app behaviour around the calls.
**NOT TESTED (scores do not cover it):** real cloud sync and the two-device round trip; real auth round trip; voice capture (no microphone); Form Coach on real footage; a real screen reader (TalkBack/VoiceOver); production service-worker behaviour on the real deployment; real-device performance.

## Manual device checklist (owner's phone only)

1. **Offline relaunch on the real deploy:** install the PWA, open once online, kill it, airplane mode, reopen — app renders? (F4-2 production confirmation.)
2. **Cold offline tab after an update:** before opening Train online, go offline and open Train. (F4-1 production confirmation.)
3. **Keyboard typing (bug Phase 1, B1):** type in the scan Fine-tune box and Add Item name with Gboard and Samsung Keyboard — characters must land in order.
4. **Keyboard coverage (B2):** with the keyboard open in the scan review, the focused field must scroll into view on the real device.
5. **Rest-timer sound** audibility with the phone locked/pocketed.
6. **Form Coach on real footage:** the nine synthetic-only exercises; lockout display; count vs human count.
7. **Meal scan with the real camera** on a real thali; computed confidence vs the actual food.
8. **Voice set logging** with the microphone, Hinglish phrases (Priya's untestable leg).
9. **TalkBack pass:** Today → start workout → complete a set (rest-timer announcement) → Fuel quick log.
10. **Two-device sync:** log on both devices while one is offline, reconnect, confirm nothing lost or duplicated; then a backup export → Start Fresh → restore.
11. **Health Connect** partial grants and notification outcomes; C25K player end-to-end; stale-draft prompt on relaunch.
12. **Notch / gesture-bar safe areas** in a live session — Complete Set reachable one-handed.
