# Phase 9 — Synthetic users: desk simulation (RE-AUDIT, 2026-10-29)

Method: persona journeys traced through code + the repo's persona test
suites (15 persona-* test files, all inside the 2,336 passing). This is a
DESK simulation — no live sessions were run by this stage; where a journey
was live-verified by the parent agent at merge time, that is stated.
Anything beyond that is labeled NOT LIVE-TESTED.

| # | Persona | Journey traced | Evidence | Verdict |
|---|---|---|---|---|
| 1 | Fresh guest, cold start | Onboarding skip via start-fresh → default profile → Home shows today's session | store start-fresh path (archive-then-default); PR #52 behavior; live-verified at PR #58/#59 merges (guest battery) | HOLDS (live-verified historically) |
| 2 | Guest asks coach "what's my workout today?" | CoachChatSection → /api/ai/coach-chat → grounding slice with TODAY from getTodaySessionState | src/lib/coach-chat.ts + workout-engine helper shared with Home; parent live check at PR #59 merge: reply named "Upper B" matching Home | HOLDS (live-verified at merge; re-check is PARENT-STAGE) |
| 3 | Guest with pain ("my knee hurts") | Safety scan fires before any provider call → refer-out copy | route code path (Phase 3); parent live API check at merge: provider:"safety" | HOLDS (live-verified at merge) |
| 4 | Guest tries to burn AI quota | Per-minute IP limits + guest daily bucket (sha256(ip) key) + shared 500/day fleet cap | src/lib/ai-quota.ts — the NAT-sharing limitation of the guest bucket is documented in the module's own comments (accepted trade-off, bounded by per-minute limits + global cap) | HOLDS, with the documented NAT caveat |
| 5 | Returning signed-in user, 2nd device | Pull sync keep-newest; per-account namespaced local state | sync.ts + store (Phase 5); same-row conflict case = R1 | PARTIAL — code path sound; same-row conflict NOT LIVE-TESTED (unchanged from gauntlet) |
| 6 | Hindi user | Full hi dictionary, coach chat hi strings, DOB picker labels | Phase 6 parity count; 14 coachChat.* hi strings shipped unreviewed on the user's merge order | PARTIAL — parity is mechanical; native-speaker review still owed (user's item) |
| 7 | Fasting user (one-meal fast day) | Macro split percentages use scaled calories | historical F16 fix (macroSplitPercentages); persona/standards tests in suite | HOLDS (test-covered) |
| 8 | Offline / flaky-network user | Local-first store keeps logging; sync error surfaces with retry | store + SyncErrorBanner (Phase 7) | PARTIAL — banner appearance live = R3, NOT LIVE-TESTED (unchanged) |
| 9 | User deleting their account | Settings → emailed signed link → deletion + nonce replay protection | delete-account route + consumed_deletion_nonces (Phase 4) | PARTIAL — emailed-link end-to-end = SEC-06, NOT LIVE-TESTED (unchanged) |
| 10 | Coach-plan user accepting a new block | Plan staging must not self-trigger the history fork | applyPendingProfile trigger condition (Phase 8 item h) | HOLDS per code check (Phase 8) |

## Findings from this phase

None new. The three PARTIALs are the same live-verification gaps the
gauntlet closed with — they persist because they need signed-in accounts,
real email delivery, or a second device, none of which this stage may
touch (production is read-only; account creation is prohibited). They are
carried into 12-final-verification.md as NOT TESTED, not as defects.
