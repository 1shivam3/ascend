/**
 * UI/UX audit Phase 5, Task 5.1 — navigation & structure batch
 * (P2-6, P2-7, P2-8, P3-3). Source pins for the per-item fixes:
 *
 *  (a) tab roots carry no back chevron (chevrons only in pushed flows)
 *  (b) Train tools button is named (already correct — regression pin)
 *  (d) Fuel has one photo-scan + one barcode entry, consistently named
 *  (e) active block → "View current block", never "Build next block"
 *  (f) Train tab icon is the dumbbell (already correct — pin)
 *  (g) Today quote lives in a card
 *  (h) History rows carry title, volume, duration
 *  (i) two-letter day labels + week-over-week compare line
 *  (j) completed-day CTA derives from completion state alone;
 *      rest day gains "Train anyway"
 *  (k) Customize Today rows are draggable (buttons kept as fallback)
 *  (l) neutral email placeholder + logo mark on sign-in
 *  (m) active-workout bottom padding is mode-aware
 *  (n) tab chunks preload at idle (skeleton-timing fix)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const en = read('src/lib/i18n/en.ts');
const hi = read('src/lib/i18n/hi.ts');

describe('5.1(a) — no back chevron on tab roots', () => {
  it('WorkoutPage, MealsPage, ProgressPage and PRsPage no longer consult the app-stack back state', () => {
    for (const f of [
      'src/components/WorkoutPage.tsx',
      'src/components/MealsPage.tsx',
      'src/components/ProgressPage.tsx',
      'src/components/PRsPage.tsx',
    ]) {
      expect(read(f), f).not.toContain('canGoBack');
    }
  });

  it('Progress keeps exactly one chevron — the pushed sub-view return', () => {
    const progress = read('src/components/ProgressPage.tsx');
    expect(progress).toContain("setStrengthSubView('overview')");
    expect(progress).not.toContain("setActiveTab('strength')}\n");
    expect(progress).not.toContain("aria-label={t('progress.goBack')}");
  });

  it('Profile and Settings render the chevron only in pushed (onBack) mode', () => {
    expect(read('src/components/ProfileView.tsx')).toContain('{onBack && (');
    expect(read('src/components/SettingsView.tsx')).toContain('{onBack && (');
  });
});

describe('5.1(b/f) — already-correct items stay correct', () => {
  it('Train tools button carries title + aria-label naming it', () => {
    const workout = read('src/components/WorkoutPage.tsx');
    expect(workout).toContain("title={t('tools.title')}");
    expect(workout).toContain("aria-label={t('tools.title')}");
    expect(en).toContain("'tools.title': 'Training Tools'");
  });

  it('Train tab icon is the dumbbell glyph', () => {
    const page = read('src/app/page.tsx');
    expect(page).toContain("icon: Dumbbell");
  });
});

describe('5.1(d) — one scan entry per kind on Fuel, one name everywhere', () => {
  it('dictionary names are consistent', () => {
    expect(en).toContain("'meals.scanMeal': 'Scan Meal (Photo)'");
    expect(en).toContain("'home.mealScan': 'Scan Meal'");
    expect(en).toContain("'home.scan': 'Scan Barcode'");
    expect(en).toContain("'scan.title': 'Scan Meal'");
    expect(hi).toContain("'meals.scanMeal': 'मील स्कैन (फ़ोटो)'");
    expect(hi).toContain("'scan.title': 'मील स्कैन'");
  });

  it('the barcode label is used exactly once on the Fuel screens (the tile)', () => {
    const meals = read('src/components/MealsPage.tsx');
    expect(meals.split("t('meals.scanBarcode')").length - 1).toBe(1);
  });

  it('the Today photo tile uses the shared Scan Meal (Photo) label', () => {
    const meals = read('src/components/MealsPage.tsx');
    expect(meals).toContain("{t('meals.scanMeal')}");
  });

  it('history header scan button hides while the empty-state CTA is the entry', () => {
    const meals = read('src/components/MealsPage.tsx');
    expect(meals).toContain('{groupedMeals.length > 0 && (');
  });
});

describe('5.1(e) — block card action is state-correct', () => {
  it('active block shows View current block; the build-next label is gone from the card', () => {
    const chat = read('src/components/CoachChatTab.tsx');
    expect(chat).toContain("t('coachBlock.viewCurrent')");
    expect(chat).not.toContain("t('coachBlock.buildNext')");
    expect(en).toContain("'coachBlock.viewCurrent': 'View current block'");
    expect(hi).toContain("'coachBlock.viewCurrent': 'मौजूदा ब्लॉक देखें'");
  });

  it('WorkoutPage wires viewing the block to the Plans sub-tab (where its plans live)', () => {
    expect(read('src/components/WorkoutPage.tsx')).toContain("onViewBlock={() => enterTrainSubTab('plans')}");
  });
});

describe('5.1(g/h) — Today quote card + richer History rows', () => {
  it('quote section renders inside the standard Today card chrome', () => {
    const home = read('src/components/HomePage.tsx');
    const quoteIdx = home.indexOf("'quote': (");
    const quoteBlock = home.slice(quoteIdx, quoteIdx + 900);
    expect(quoteBlock).toContain('bg-bg-card border border-border/80 rounded-2xl p-5 shadow-xs');
  });

  it('history rows compute title, volume and duration', () => {
    const workout = read('src/components/WorkoutPage.tsx');
    expect(workout).toContain('calculateWorkoutVolumeKg(workout)');
    expect(workout).toContain('const rowTitle = workout.name?.trim() || null;');
    expect(workout).toContain('formatDuration(durationSeconds)');
  });
});

describe('5.1(i) — consistency labels and comparison', () => {
  it('day labels are two-letter in both day-label sets', () => {
    expect(read('src/components/ProgressPage.tsx')).toContain("['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']");
    expect(read('src/components/WeeklyHabitMatrix.tsx')).toContain("['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']");
  });

  it('the week-over-week line is computed and rendered', () => {
    const progress = read('src/components/ProgressPage.tsx');
    expect(progress).toContain('weekCompare');
    expect(progress).toContain("t('progress.weekCompare'");
    expect(en).toContain("'progress.weekCompare': 'This week vs last week:");
    expect(hi).toContain("'progress.weekCompare':");
  });

  it('Muscle Volume legend words come from the dictionary now', () => {
    const section = read('src/components/MuscleVolumeSection.tsx');
    expect(section).toContain("t('progress.thisWeek')");
    expect(section).toContain("t('progress.lastWeek')");
    expect(en).toContain("'progress.thisWeek': 'This week'");
    expect(en).toContain("'progress.lastWeek': 'Last week'");
  });
});

describe('5.1(j) — Today CTA derives from a single state', () => {
  it('the completed-day label/destination no longer depend on coachEnabled or a second derivation', () => {
    const home = read('src/components/HomePage.tsx');
    expect(home).not.toContain('completedWorkoutForToday && uiPreferences.coachEnabled');
    expect(home).not.toContain('uiPreferences.coachEnabled && isCompletedWorkoutModalOpen');
  });

  it('the take modal receives coachEnabled so coach-off still shows the summary', () => {
    expect(read('src/components/HomePage.tsx')).toContain('coachEnabled={uiPreferences.coachEnabled}');
  });

  it('rest day gains the Train anyway secondary opening the plan picker', () => {
    const home = read('src/components/HomePage.tsx');
    expect(home).toContain("t('home.trainAnyway')");
    expect(home).toContain('sessionInfo.isRestDay && sessionInfo.status !== \'completed\'');
    expect(en).toContain("'home.trainAnyway': 'Train anyway'");
    expect(hi).toContain("'home.trainAnyway': 'फिर भी ट्रेनिंग करें'");
  });

  it('rest day hides the primary Start Workout — Train anyway is the only action (owner decision 2026-11-08)', () => {
    const home = read('src/components/HomePage.tsx');
    // The primary CTA is wrapped in the negated rest-day condition:
    // on a rest day (not completed, no draft) it is not rendered.
    expect(home).toContain("!(sessionInfo.isRestDay && sessionInfo.status !== 'completed' && !activeWorkoutDraft)");
    // The reversed phase-5 rationale must not survive in the source.
    expect(home).not.toContain('stays "Start Workout" (starts the next planned session)');
  });
});

describe('5.1(k) — Customize Today drag handles', () => {
  it('the sheet supports drag reorder and keeps the up/down buttons', () => {
    const sheet = read('src/components/CustomizeSheet.tsx');
    expect(sheet).toContain('GripVertical');
    expect(sheet).toContain('onReorder');
    expect(sheet).toContain('draggable={!section.locked && !!onReorder}');
    expect(sheet).toContain("t('customize.moveUp')");
    expect(sheet).toContain("t('customize.moveDown')");
  });

  it('both owners commit a drag in one write', () => {
    expect(read('src/components/HomePage.tsx')).toContain('onReorder={handleReorderSections}');
    expect(read('src/components/SettingsView.tsx')).toContain('onReorder={handleReorderSections}');
  });
});

describe('5.1(l) — sign-in polish', () => {
  it('email placeholders are the neutral example on both auth screens', () => {
    expect(read('src/components/onboarding/LoginScreen.tsx')).toContain('placeholder="you@email.com"');
    expect(read('src/components/onboarding/CreateAccountScreen.tsx')).toContain('placeholder="you@email.com"');
    expect(read('src/components/onboarding/LoginScreen.tsx')).not.toContain('alex@example.com');
    expect(read('src/components/onboarding/CreateAccountScreen.tsx')).not.toContain('alex@example.com');
  });

  it('the ASCEND logo mark shows on the sign-in screen', () => {
    expect(read('src/components/onboarding/LoginScreen.tsx')).toContain('src="/ascend-logo.png"');
  });
});

describe('5.1(m/n) — workout-screen gap + Train skeleton timing', () => {
  it('active-workout bottom padding is mode-aware (no dead gap above the in-flow beginner bar)', () => {
    expect(read('src/components/ActiveWorkoutScreen.tsx')).toContain(
      "workoutMode === 'beginner' ? 'pb-6' : 'pb-16'",
    );
  });

  it('tab chunks preload during idle time after first paint', () => {
    const page = read('src/app/page.tsx');
    expect(page).toContain('requestIdleCallback');
    expect(page).toContain("import('@/components/WorkoutPage')");
    expect(page).toContain("import('@/components/MealsPage')");
    expect(page).toContain("import('@/components/ProgressPage')");
  });
});
