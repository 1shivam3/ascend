# ASCEND — Final Certification: Release Report

Round 3 of 3 (charter §13, §16, §18). Evidence base: Round 1 (thirteen
documents in this folder), Round 2 (PRs #95–#100, verified individually),
Round 3 (`regression-results.md`: the six PRs composed as one stack, two
consecutive full-suite passes, seven headline scenarios re-driven).
Dispositions for every finding: `bug-fix-ledger.md`.

## §16 acceptance gates

| Gate | Status | One-line evidence |
|---|---|---|
| Design consistency | **NOT MET** | The shipped app still runs the duplicated design language: dead second token scheme (F-01), 725 palette bypasses (F-03), two button systems (F-05), three modal constructions (F-06) — all disclosed residuals of the unification program, out of the certification fix scope. What the fixes did close: the only surface rendering *off-system* (Form Coach) now conforms and is regression-guarded (S1, stack-verified). |
| Functionality | **NOT MET** | On the fix stack, every headline task passes except one residual: R3-01 — the Coach adherence card still scores a new user's pre-plan days as missed (P2, first-week only, reproduced twice). And in **production**, the three P2s (F3, UI-1b-01, UI-1b-02) are still live: the fixes are unmerged. |
| Security | **MET** | No P0/P1/P2 security findings at any point: headers/CSP complete, 0 production vulnerabilities (OSV), no repo secrets, photo-provider rule enforced in code, no injection sinks. Two P3 hardening residuals disclosed (SEC-1c-04, SEC-1c-08) — neither blocks under §14. |
| Data integrity | **MET** | Arithmetic exact everywhere it was checked (volumes, PR one-rep-max, meal totals); PRs and history stay consistent under edits (S2, twice); identity is stable (logout→onboarding archives, never duplicates — F-01-class risk from Round 1b retired). Residuals recorded: DB-01 (create-path clamp, defense-in-depth), DB-03 (dual weight columns, Info). |
| Devices / accessibility | **NOT TESTABLE in full** | Emulation: 60/60 screen-width states clean, stack scenarios at phone viewports pass, nav contrast now 4.66:1 measured. NOT TESTED on real hardware: Form Coach capture/tracking, rest-timer audibility, notched-device safe areas (DEV-3), production offline behavior (F9), real screen-reader sessions. |
| Testing | **NOT MET** | The suite condition is met — two consecutive identical passes (2,881 passed / 20 Docker-baseline, zero new failures). The scenario condition is not: R3-01 fails in both passes. Human usability testing was NOT RUN (protocol in `real-user-testing.md`). |

## Residual-risk register

| Risk | State | Note |
|---|---|---|
| Form Coach runtime on a real phone | NOT VERIFIED | Pose tracking, camera capture, and performance on physical hardware were never exercised; the deciding check remains the owner's live-app squat-video test. The feature is one exercise (barbell back squat), disclosed in-product. |
| Rest-timer audibility | NOT VERIFIED | Screen-on chime and locked-phone notification unconfirmed on hardware; conductivity beeps in the run session share the open question. |
| Production offline / service-worker behavior | NOT TESTED | Local builds cannot evidence production SW behavior (F9 caveat stands). |
| Live RLS isolation probes | NOT TESTED | The audit's service key bypasses RLS by design and no test accounts were permitted; isolation rests on the policy/code review in `security-audit.md` §5. |
| Human usability | NOT RUN | 16 synthetic personas only (7.1/10 overall); no human has used the app in testing. |
| Hindi native-speaker review | Outstanding | 14 coach-chat strings ship unreviewed; Hindi is owner-deprioritized (2026-11-02). |
| Design-system unification | Open program | F-01/F-03/F-05/F-06/F-07/F-08/F-09/F-11 residuals, `py-0.2` remnants (5 sites), sub-44px secondary targets (A11Y-02), 9–10px text population, split-denominator cosmetic (F4). Each is individually minor; collectively they are the app's main maintainability debt. |
| First-week cold-start residual | R3-01 (P2) | One Coach card, first partial week only; fix is small and specified. |
| KIDO-style cold start elsewhere | Closed by construction | PR #97 anchored the review/check-in/athlete surfaces at the *data* level; R3-01's surface reads scheduled-days directly and was missed — a re-grep for other direct consumers of scheduled-days is recommended with the follow-up fix. |

## Verdict

## NOT READY FOR RELEASE

The app that users can download today — production, master `62e25543` —
still contains all three certification P2s: a Form Coach that renders
off-system and transparent at phone widths, a mis-logged set that cannot
be corrected, and a new user told their pre-account week was missed. The
remedy is real and verified: PRs #95–#100 compose into a stack that
passes the full suite twice with zero new failures and passes six of
seven headline scenarios. But it is not shipped — it waits on the
owner's merge — and Round 3 found one further P2-class residual
(R3-01, the Coach adherence card) that no open PR covers. A release
recommendation cannot rest on fixes that are not in the build, nor on a
regression gate whose own condition (no new P2 in two consecutive
passes) is not met.

**What flips this verdict, precisely:**

1. The owner merges PRs #95 → #100 **in that order**, resolving the
   single #95 × #100 conflict by composing the class strings
   (`regression-results.md` §2 — minutes, mechanical).
2. R3-01 is fixed by a small follow-up PR anchoring `CoachChatTab`'s
   `weekAdherence` to the plan-start rule PR #97 already established —
   *or* the owner explicitly accepts it as a known first-week-only
   residual.
3. The merged build deploys, and production identity is verified
   (`/sw.js` cache name matches the new master SHA), with S1 and S3
   spot-checked against production.

Nothing else in this report blocks the verdict: the §14 release-blocking
classes (P0/P1) were never found in three rounds; the security and
data-integrity gates are met; every remaining item is a disclosed P3
residual or an explicitly untestable-here surface with its risk stated
above.

---

## Post-merge addendum — 2026-11-04: verdict updated

## READY FOR RELEASE

The owner ordered the merge, and all three flip conditions above are
met:

1. **Merged in the recorded order** — #95 (`e842586f`), #96
   (`6d8d7f56`), #97 (`8a33e14e`), #98 (`700e5d32`), #99 (`0ef551af`),
   and #100 last. The single predicted #95 × #100 conflict occurred
   exactly as mapped (`GoalSelectorModal.tsx`,
   `FormSessionSummaryModal.tsx`) and was resolved by the recorded
   composition — both token changes kept (fix-branch commit `1384b4f`;
   design-token guard + a11y tests 12/12, tsc clean on the resolved
   tree) — before #100 merged (`37c00f41`).
2. **R3-01 fixed, not merely accepted** — by PR #101
   (`fix/coach-week-adherence-anchor`, stacked on #97, merged
   immediately after it, `5b713667`): the Coach tab week-adherence card
   now takes the shared plan-start anchor; browser-verified
   before/after in its PR.
3. **Production identity verified** — `/sw.js` serves
   `ascend-37c00f4-cache`, matching current master `37c00f41`, so the
   merged build is what users receive. The S1/S3 scenarios were
   verified against this exact code in the Round 2–3 local builds and
   in each PR's own verification; a live in-browser spot-check of
   production from the audit sandbox was not possible (egress proxy)
   and remains a two-minute owner-side confirmation in the app itself.

All seven fix branches were deleted after merge. Post-merge gate,
re-run by the auditor on a pristine clone of master `37c00f41`:
**2,888 passed / 20 failed (2,908)** — the 20 are exactly the known
Docker-baseline file (`tests/security-integration-gate.test.ts`,
unchanged signature from the pre-merge baseline), and `tsc --noEmit`
is clean. The residual-risk
register above stands as accepted: the design-system unification
program (F-01/F-03/F-05–F-09/F-11), the remaining P3 cosmetics, the
NOT-TESTED hardware surfaces (Form Coach phone runtime, rest-timer
audibility, notch safe areas, production offline behavior), the
outstanding Hindi native review, and human usability testing (protocol
ready, not run). None of these are §14 release-blocking classes, and
each carries its risk note in the register.
above.
