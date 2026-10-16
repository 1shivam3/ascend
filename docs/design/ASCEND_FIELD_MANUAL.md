# ASCEND UI/UX Redesign — Field Manual

## Audit scope

Repository audited before implementation: Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Zustand persistence, Lucide icons, Supabase optional sync/auth, and a Capacitor Android wrapper. The app is a single main app shell at `src/app/page.tsx`; the main product destinations are tab-driven rather than separate page routes.

## Existing screen and journey inventory

### App shell and onboarding
- Hydration/splash state and profile-gated onboarding/sign-in.
- Today, Train, Progress, and Fuel primary destinations.
- URL/local-storage-backed navigation, browser/native back handling, shared-program import, quick actions, offline status.
- System theme synchronization unless the athlete has explicitly selected a theme.
- Public/legal routes: privacy, terms, disclaimer, and external account-deletion route.

### Today
- Scheduled/today workout, recovery/rest day, resume/discard draft, adaptive split, workout change, and manual past-workout logging.
- Weekly training consistency, daily calories/protein, quick meal scan, training/adherence and recent training context.
- Settings access.

### Train and active session
- Weekly schedule and split presets, saved plans, recent workout history, plan creation/editing, start/resume.
- Exercise selection/library, swaps/substitution, crowded-gym and time-crunch adaptations, training policy/decision explanations.
- Active-set logging, beginner/advanced mode, RPE/RIR and prescriptions, rest timer, haptic/audio feedback, plate helper, warm-up sets, voice logger, workout pause/autosave/resume/finish, PR detection, and post-workout review.
- Past workout entry, shared-program import/export, and plan-vs-actual review.

### Progress
- Strength trends, estimated 1RM and strength standards/DOTS tools where applicable, PRs, bodyweight/body metrics, training consistency/adherence, workout heatmap, weekly recap/share card, and the lifter/training-decision view.
- Existing meaningful analytics remain bound to actual store/history data; the redesign does not add mock metrics.

### Fuel / nutrition
- Daily macro and calorie pacing, food logging (manual and natural-language parser), saved/pinned foods, barcode scanner, optional photo scan, macro goal controls, copy prior meals, hydration/water logs, creatine logs, and their existing configuration modals.

### Profile, settings, data, and account
- Athlete profile/goals/body metrics, unit and experience mode, light/dark/system theme selection, reminders/notifications, optional cloud auth/sync, feedback/telemetry consent, data-vault backup/restore, legal hub, and in-app/external account deletion.

### Backend and persistence boundaries
- Workout/prescription/decision policy, progression calculations, nutrition calculations, local-first persistence, offline/service-worker behavior, Supabase sync/RLS, authentication, notification dispatch, account deletion, and rate limiting are application logic. This UI branch intentionally does not rewrite those systems or alter database schemas/API contracts.

## Observed UI patterns to correct

- The core experience already had functional navigation and many purposeful features, but its visual treatment leaned heavily on generic rounded containers, several near-identical card surfaces, small uppercase metadata, repeated mini-icons, subtle gradients/shadows, and inconsistent heading scales.
- The primary app container was constrained to a phone-sized width on desktop despite having responsive markup.
- The main workout hero and navigation lacked a distinctive visual language that carried consistently into secondary screens.
- A number of secondary dialogs used slightly different surface, border, corner, and elevation treatments.
- Progress tabs used filled rounded controls while other sub-navigation used an underlined treatment; this redesign aligns the primary Progress view tabs while leaving the Strength subview control independent.

## Design direction — Field Manual

- **Brand:** ASCEND wordmark with a simple ascending three-bar mark; no mountain illustration or motivational copy.
- **Palette:** warm chalk/paper and deep ink with a vermilion action accent in light mode; a low-glare charcoal/olive surface with a coral signal accent in dark mode.
- **Typography:** existing Inter body face plus existing Barlow Condensed display face; numerals use tabular alignment where data is shown.
- **Surfaces:** thin dividers, fewer shadows/gradients, restrained 10px control and 14px panel radii.
- **Navigation:** existing four-tab mobile bottom bar retained; desktop gains a persistent workspace rail with active-state rule, quick action, athlete identity, and settings.
- **Active workout:** dedicated full-screen focus frame remains separate from the general page shell; touch targets and core session actions remain intact.
- **Feedback/accessibility:** visible keyboard focus, reduced-motion support, safe-area-aware mobile padding, readable semantic tokens, and existing toast/validation mechanisms retained.

## Implementation map

- `src/app/globals.css`: semantic light/dark tokens, typography/layout scale, surfaces, navigation rail and tab bar, modal and active-session polish, responsive rules, reduced-motion and focus-visible states.
- `src/app/page.tsx`: responsive desktop rail using the same navigation provider and quick-action/settings handlers; the mobile tabs and current route semantics are preserved.
- `src/components/HomePage.tsx`: intentional training hero, weekly strip and nutrition entry-point hooks into the shared visual system.
- `src/components/ActiveWorkoutScreen.tsx`: dedicated active-session shell styling.
- `src/components/Onboarding.tsx`: shared brand mark/wordmark.
- `src/components/WeeklyScheduleModal.tsx`: uses the common modal surface.
- `src/components/ui/Button.tsx`, `src/components/ui/Card.tsx`: reuse design-token radii and reduce unnecessary transition motion.
- No feature-specific state, calculations, API contracts, store schemas, or Supabase migrations were intentionally changed.

## Validation notes

This redesign is authored on `ui/complete-redesign-2026-10` based on the synchronized `main`/`master`/ `experiment` HEAD at `2c975fa5a2d8692f7c99cd7dfc164b0eac5002d5`. The connector environment cannot run the project locally, and a local git clone could not resolve GitHub from its shell environment. Therefore, type-check, lint, unit tests, browser/device screenshots, and live user-flow checks are **not yet verified** for this branch. Open a pull request and let repository CI run; manually inspect mobile and desktop, light and dark themes, onboarding, active logging, progress tabs, meal scanning/logging, settings, modal keyboard/back behavior, and offline mode before merging.

The supplied APK config points to a remote Vercel deployment URL. It does not bundle the full Next.js UI; an APK update is not automatically produced by merging this source branch.
