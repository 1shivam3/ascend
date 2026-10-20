/**
 * English UI strings — the source of truth for i18n keys.
 *
 * Keys are flat, dot-namespaced by surface (`home.*`, `train.*`, …).
 * Every key added here is what components render in English; `hi.ts`
 * overrides the ones that have a Hindi translation, and `translate()`
 * falls back to these values silently for anything untranslated —
 * a raw key must never reach the screen.
 *
 * Numerals stay Latin in both languages (standard in Indian apps);
 * only words localize.
 */
export type Language = 'en' | 'hi';

export const en = {
  // ── Common actions ──────────────────────────────────────────────────
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.start': 'Start',
  'common.finish': 'Finish',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.continue': 'Continue',
  'common.done': 'Done',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.remove': 'Remove',
  'common.search': 'Search',
  'common.loading': 'Loading…',
  'common.today': 'Today',

  // ── Bottom navigation ───────────────────────────────────────────────
  'nav.today': 'Today',
  'nav.train': 'Train',
  'nav.progress': 'Progress',
  'nav.fuel': 'Fuel',

  // ── Home ────────────────────────────────────────────────────────────
  'home.greetingMorning': 'Good morning,',
  'home.greetingAfternoon': 'Good afternoon,',
  'home.greetingEvening': 'Good evening,',
  'home.greetingNight': 'Good night,',
  'home.todaysWorkout': "Today's Workout",
  'home.nutrition': 'Nutrition',
  'home.protein': 'Protein',
  'home.calories': 'Calories',
  'home.readiness': 'Readiness',
  'home.mealScan': 'Meal Scan',
  'home.scan': 'Scan',
  'home.weight': 'Weight',
  'home.hydration': 'Hydration',
  'home.habitsThisWeek': 'Habits This Week',
  'home.notifications': 'Notifications',
  'home.weeklyTarget': 'Weekly Target',
  'home.start': 'Start',
  'home.restDay': 'Rest Day',

  // ── Train / Plans ───────────────────────────────────────────────────
  'train.plans': 'Plans',
  'train.history': 'History',
  'train.startWorkout': 'Start Workout',
  'train.startEmptyWorkout': 'Start empty workout',
  'train.yourPlans': 'Your Workout Plans',
  'train.exercises': 'Exercises',

  // ── Meals ───────────────────────────────────────────────────────────
  'meals.quickLogPlaceholder': 'e.g. 2 eggs, 100g oats, 1 scoop whey',
  'meals.foodNamePlaceholder': 'Food name (e.g. Chicken breast, Eggs, Rice, Whey)',
  'meals.calories': 'Calories',
  'meals.protein': 'Protein',
  'meals.carbs': 'Carbs',
  'meals.fat': 'Fat',
  'meals.addFood': 'Add Food',
  'meals.breakfast': 'Breakfast',
  'meals.lunch': 'Lunch',
  'meals.dinner': 'Dinner',
  'meals.snack': 'Snack',
  'meals.preWorkout': 'Pre-Workout',
  'meals.postWorkout': 'Post-Workout',
  'meals.lateMeal': 'Late Meal',

  // ── Onboarding ──────────────────────────────────────────────────────
  'onboarding.welcomeTitle': 'Build a stronger you, one day at a time.',
  'onboarding.welcomeSubtitle': 'Track your workouts, nutrition, and progress — all in one place.',
  'onboarding.getStarted': 'Get Started',
  'onboarding.haveAccount': 'I already have an account',
  'onboarding.continueAsGuest': 'Continue as Guest',
  'onboarding.language': 'Language',
  'onboarding.goalsTitle': 'What are your fitness goals?',
  'onboarding.goalsSubtitle': 'Select all that apply.',
  'onboarding.experienceTitle': "What's your experience level?",
  'onboarding.detailsTitle': 'Tell us about yourself',
  'onboarding.scheduleDaysTitle': 'How many days can you lift each week?',
  'onboarding.equipmentTitle': 'What equipment do you have?',
  'onboarding.planOfferTitle': 'Want your training plan?',
  'onboarding.acceptPlan': 'Yes, add my plan',
  'onboarding.declinePlan': "No thanks, I'll build my own",

  // ── Settings ────────────────────────────────────────────────────────
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.languageHint': 'Applies instantly across the app. More screens are being translated.',
  'settings.customization': 'Customization',
  'settings.dietPreference': 'Diet Preference',
  'settings.weeklyWorkoutTarget': 'Weekly workout target',
  'settings.gamification': 'Gamification',
  'settings.coach': 'Coach',

  // ── Crowded-gym mode ────────────────────────────────────────────────
  'packed.toggle': 'Gym packed?',
  'packed.tryInstead': 'Packed gym: try {name} instead',
  'packed.swap': 'Swap',
  'packed.keep': 'Keep',
  'packed.previewHint': 'Pre-swap to dumbbell & bodyweight moves you can do anywhere.',
} as const;

export type StringKey = keyof typeof en;

/** Monday-first weekday names (numerals stay Latin; names localize). */
export const WEEKDAYS: Record<Language, { short: string[]; full: string[] }> = {
  en: {
    short: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    full: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
  hi: {
    short: ['सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि', 'रवि'],
    full: ['सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार'],
  },
};
