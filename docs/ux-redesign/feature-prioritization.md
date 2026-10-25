# ASCEND UX Redesign — Feature Prioritization (Phase 3)

> **Status:** Decision document, companion to `information-architecture.md`. Every important feature from the baseline inventory is classified once. P0 = critical (essential flow or data protection). P1 = primary (frequent, high-value, immediately discoverable). P2 = supporting (belongs in its section, need not dominate). P3 = advanced/infrequent (accessible, not overwhelming the default). Placement: prominent / in-context / expanded-on-demand / hidden-but-discoverable / consolidated / simplified-visually. **No feature is classified for product removal.** Interface-removal candidates are listed separately at the end and require the user's explicit approval — none is approved here.

## P0 — Critical (must work, must be prominent or safely reachable, never broken by redesign)

| Feature | Placement | Rationale / preservation note |
|---|---|---|
| Today's workout card (start/resume, plan-sync contract) | Prominent (Today top, unhideable) | The daily job. Never shows a contradictory start during an active workout. |
| Active workout set logging (weight/reps steppers, complete, next action) | Prominent (fullscreen perform surface) | The highest-interaction surface. Core fields never behind an expander. |
| Draft auto-save + recovery (logger + active) | In-context (automatic + explicit "Draft restored" affordance) | Data-protection: the interruption guarantee. Never silently merge stale drafts. |
| Finish workout + summary (duration, sets, volume, genuine PRs) | Prominent (summary first) | Must use stored/calculated values only; PR derivation single-source. |
| Meal logging (scan / manual / barcode / voice / NL) + review + save | Prominent (Fuel + Today fast path, same form) | Daily job for nutrition users. Scan honesty boundary (exact vs estimated) is P0. |
| Food totals vs targets (calories, protein; carbs/fat on Fuel) | Prominent (Today strip + Fuel) | Totals must match Fuel exactly (same calculation). |
| Sign-in / sign-out (all 5 methods, neutral errors, keep-vs-clear semantics) | In-context (You → Account & Security, unified display) | Auth boundaries untouched; never expose "Supabase" in user copy. |
| DataVault backup import/export | In-context (Settings → Data & Privacy) | Must state coverage (6-table sync vs local-only) before export. |
| Data purge + delete account (token-mailed, multi-step confirmations) | Hidden-but-discoverable (Settings → Data & Privacy, confirmed) | Destructive flows keep every confirmation. Never simplified away. |
| Offline mode + sync reconcile (tombstones, tab-leader) | In-context (banner + Today header status + Settings status) | Local-first behavior preserved; UI copy must match 6-table reality. |
| User plans only (Train) + no pre-made routines | Prominent (Train Plans) | Standing user decision. Reintroducing templates is forbidden. |
| Guest-first access (no forced sign-in) | Prominent (onboarding, labeled) | Returning/guest paths preserved; guest→cloud merge must not duplicate. |
| BodyMetrics date truthfulness (D1) | In-context (modal) | Flagged behavior fix: pass the date through, or stop implying backdating works. Not fixable by restyling. |
| Sync status honesty (D10) | In-context (Today header + Settings) | Copy must name what syncs (6 tables) and what stays local. |

## P1 — Primary (frequent, high-value, immediately discoverable)

| Feature | Placement | Rationale / note |
|---|---|---|
| Habit matrix (Mon–Sun) + hydration/creatine quick-add | Prominent (Today) / in-context (Fuel) | Daily consistency loop. Same definitions both places. |
| Previous performance in workout | In-context (per exercise, labeled scope) | "Last session · [date]" + in-workout history expander (last 3 sessions). |
| e1RM trend + strength charts | Prominent (Progress spotlight, goal-derived, pinnable) | Chart frame standard: title + axes + units + measured/estimated legend. |
| PRs / Records (single derivation) | In-context (Progress → Records + TabId `prs`) | Rows link to setting sessions. Summary PR == Records PR. |
| Volume + muscle-volume breakdowns | In-context (Progress) | Inclusion rules stated ("working sets × reps × weight" — verify derivation wording in implementation; do not change math). |
| Weekly review + coach notes (consolidated Coach section) | In-context (Today, one section + expanders) | Evidence-backed only; dismissals persist. |
| Readiness + Level | In-context (Today supporting grid / Detailed) | Hideable; never above the workout card. |
| Pinned foods + staples & frequent (dedup) | In-context (Fuel Today) | Portion memory labeled ("your usual: …"). |
| Goals form + targets | In-context (Fuel + Profile/You) | Targets feed totals; edit path obvious. |
| Schedule editor + weekly target | In-context (You → Training Preferences; shortcut from Train) | Distinct controls, one-line explanations each; plan-sync effect stated after change. |
| Theme system (presets + custom + reset) | Prominent (You → Appearance & Personalization) | Greenfield; contrast auto-correction; semantic colors fixed. |
| Density (Simple/Detailed) | Prominent (You → Appearance & Personalization) | One key; workout mode follows with override. Migration: new → Simple, existing → Detailed. |
| Dashboard cards (visibility/order/restore) | In-context ("Customize Today" sheet) | Up/down order, no drag editor; workout card unhideable; scoped restores. |
| Exercise library + selector | In-context (logger + in-workout change-exercise) | Search/filter preserved; selection stays in-flow (modal stack semantics preserved). |
| History detail (executed sets) | In-context (Train → History modal) | Regression test `history-records-executed-sets` must keep passing. |
| Plan CRUD + share/import (`#plan=` links) | In-context (Train Plans) | Hash format preserved; delete confirmed. |
| Notifications (ReminderCenter) | In-context (Today bell + You → Settings row, same modal) | Bell stays a shortcut; row stays canonical-adjacent. |
| Coach block proposal + debrief + decision ledger | Expanded-on-demand (coach cards → full detail) | Reasoning fully preserved; placement simplified, content identical. |
| Suggested workout + plan-vs-actual review | In-context (Train/Today) | Preserved; post-finish stack replaced by summary + optional expansion. |
| Body metrics entry + history | In-context (Progress + Today log-weight action) | Date fix flagged (P0); validation preserved. |
| Run program (Couch to 5K enrollment + player) | In-context (Train, collapsed for non-enrolled) | Enrollment-only model preserved; player stays distinct from logger. |
| Crowded-gym adapter + suggestions | Expanded-on-demand (in-workout Set options / tools) | Preserved; surfaced contextually, not promoted. |
| Plate calculator + meet attempt planner | Hidden-but-discoverable (tools menu) + in-context shortcuts (barbell sets / Records) | Utility tools; shortcuts added, menu entries kept. |

## P2 — Supporting (belongs in its section, need not dominate)

| Feature | Placement | Rationale / note |
|---|---|---|
| Steps (Health Connect, conditional) | In-context (Today supporting grid, stable slot) | Appears only with synced data; slot reserved to prevent layout shift. |
| Monthly challenge (opt-in, dismissible) | Hidden-but-discoverable (Today supporting grid, below fold) | Engagement, not training. Dismissal persists. |
| Daily quote | Consolidated (Coach section footer / off in Simple) | Never a standalone section again. Motivational by design, untranslated by design. |
| XP / Level display | Simplified-visually (You compact row; Today level in Detailed supporting grid) | Gamification demoted from prime Today real estate. |
| Progress photos (with DataVault backup) | In-context (Progress) | Rendering + backup preserved; placement unchanged. |
| Strength standards | In-context (Progress / Records) | Shown with bodyweight + date context. |
| Training consistency / heatmap | In-context (Progress) | Spotlight candidate for general-fitness goal. |
| Diet preference (shared picker) | In-context (Fuel / Settings / Onboarding — one control) | Cannot disagree (already true). |
| Language (en/hi) + units (kg/lbs) | In-context (You → Training Preferences) | Dictionary swap preserved; missing-key fallback verified in implementation. |
| Text scale (normal/large/xlarge) | In-context (You → Appearance & Personalization) | 390px/xlarge audit is an implementation acceptance test. |
| Gamification / coach / habit-matrix / muscle-volume toggles | In-context (You → Training Preferences) | Existing precedent preserved; not folded into the three personalization controls. |
| Feedback modal + report flows | Hidden-but-discoverable (You / footer entry) | Preserved; not promoted. |
| Import program + share program | In-context (Train Plans) | Preserved flows. |
| Legal pages (privacy / terms / disclaimer / delete-account) | Hidden-but-discoverable (You → Data & Privacy + footer) | Support constant in `src/lib/legal.ts` untouched. |
| Telemetry consent | In-context (Settings → Data & Privacy) | Preserved; consent semantics untouched. |

## P3 — Advanced / infrequent (accessible, not overwhelming the default)

| Feature | Placement | Rationale / note |
|---|---|---|
| Policy decision ledger (full audit trail) | Expanded-on-demand (from coach decision cards) | Transparency preserved; never a top-level destination. |
| Meet attempt planner detail | Hidden-but-discoverable (tools + Records shortcut) | Expert tool; provenance lines required. |
| Supplements / creatine detail modals | In-context (Fuel habits) | Preserved; not promoted. |
| Voice workout logging | Hidden-but-discoverable (in-workout alternate input) | Preserved as an input method, not the default path. |
| NL meal parsing (`/api/ai/parse-meal`) | Hidden-but-discoverable (Fuel input options) | Preserved; same meal list destination. |
| Barcode manual fallback + OFF lookup detail | In-context (barcode flow) | Preserved. |
| Log past workout (backfill) | Hidden-but-discoverable (Today/Train) | Preserved; date semantics must be honest (same D1 class of concern — verify backfill dating in implementation). |
| Weekly recap modal | Hidden-but-discoverable (Today/Progress) | Preserved. |
| Social auth linking details (per-method status) | In-context (You → Account & Security) | Display unification only; methods + semantics untouched. |
| Advanced chart filters + ranges | Expanded-on-demand (per chart, persisted) | Detail-oriented users; defaults shown in Simple. |
| Health Connect settings + sync toggles | In-context (You → Training Preferences / Data) | Preserved; steps conditional on synced data. |
| `?state=` forced-state previews (error/loading/offline) | Hidden (dev hook, URL param) | Preserved for testing; not a user flow. |

## Interface-removal candidates — flagged, NOT approved, NOT removed

| Candidate | What it is | Why it was considered | Why it is NOT removed here | Needs |
|---|---|---|---|---|
| `public/ui-mockups.html` (D5) | Served static design showcase, remote fonts, not app UI | Confuses the product surface; not a capability | It is a public URL; removal is a scope call, not a redesign necessity | User approval † |
| `design-system/ascend/MASTER.md` content (D4) | Stale generated doc contradicting the live system | Competing source of truth | Supersede via header note (doc-only, reversible) rather than deletion, so history is preserved | Awareness (done as header note) |
| Daily quote as a standalone section | Motivational line, always last on Today | Lowest user need in the stack (P11, G) | It is user-visible content some users like; it moves (Coach footer) instead of being deleted | None (moved, not removed) |
| XP/level as a Today block | Gamification display | Prime space for a secondary metric | It moves to You (compact row) + Detailed supporting grid; the system itself is untouched | None (moved, not removed) |
| Anything else | — | — | **No product capability is proposed for removal.** If implementation finds one is needed, it returns for explicit approval first. | User approval |

## What this classification deliberately does NOT do

- It does not delete, hide-behind-paywall, or deprecate any capability. "Hidden-but-discoverable" means reachable in ≤2 taps from a labeled home surface, not removed.
- It does not change any calculation, derivation, data shape, auth method, sync table, or API contract. Placement and visibility change; behavior does not.
- It does not resolve the flagged behavior fixes (D1 date plumbing, D6 SW cache). Those are separate scope decisions listed in the IA doc and the debate doc.
