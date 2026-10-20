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
  'home.resumeWorkout': 'Resume Workout',
  'home.viewCompletedWorkout': 'View Completed Workout',
  'home.notificationSettings': 'Notification Settings',
  'home.level': 'Level',

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

  // ── Permission help (denied-permission guidance) ────────────────────
  'perm.title': 'Permission is off',
  'perm.openSettings': 'Open Settings',
  'perm.tryAgain': 'Try again',
  'perm.notificationsWhy': 'Reminders need notification permission to reach you.',
  'perm.notificationsWebPath': 'Allow Notifications for ASCEND in your browser\u2019s site settings, then reopen this screen.',
  'perm.microphoneWhy': 'Voice logging needs the microphone to hear your sets.',
  'perm.microphoneWebPath': 'Allow microphone access for this site in your browser\u2019s site settings, then tap Try again.',
  'perm.cameraWhy': 'Scanning needs the camera to see barcodes and food photos.',
  'perm.cameraWebPath': 'Allow camera access for this site in your browser\u2019s site settings, then tap Try again.',
  'perm.healthWhy': 'Health Connect access lets ASCEND read your steps, sleep and weight.',
  'perm.healthWebPath': 'Health Connect is only available in the Android app.',

  // ── Health Connect ──────────────────────────────────────────────────
  'health.title': 'Health Connect sync',
  'health.hint': 'Reads steps, sleep and weight from Health Connect into readiness and body metrics. Off until you connect.',
  'health.connect': 'Connect',
  'health.lastSynced': 'Last synced {time}',
  'health.neverSynced': 'Not synced yet',
  'health.stepsToday': 'Steps today',
  'health.unavailable': 'Health Connect is not available on this device.',

  // ── Progress: muscle volume & recovery ──────────────────────────────
  'progress.muscleVolume': 'Muscle Volume',
  'progress.setsThisWeek': 'sets this week',
  'progress.recoveryMap': 'Recovery',
  'progress.recoveryFresh': 'Fresh',
  'progress.recoveryRecent': 'Recent',
  'progress.recoveryFatigued': 'Fatigued',
  'progress.recoveryNever': 'Not trained yet',
  'progress.daysAgo': '{days}d ago',
  'progress.volumeWhyLabel': 'How is this calculated?',

  // ── Data export ─────────────────────────────────────────────────────
  'settings.exportCsv': 'Export CSV',
  'settings.exportCsvHint': 'Workouts, meals and body metrics in spreadsheet-friendly CSV',

  // ── %1RM programming ────────────────────────────────────────────────
  'plan.intensityPercent': 'Use % of 1RM',
  'plan.intensityPercentHint': 'Main lifts get suggested loads from your estimated 1RM (top set 80%, back-offs 70%). RPE stays the default.',
  'plan.intensityNoData': 'Log a heavy set or a PR for a main lift to enable % suggestions.',
  'plan.suggestedFrom1rm': '≈ {weight} {unit} top set · {pct}% of {e1rm} {unit} est. 1RM',

  // ── Friend challenges (code exchange, local-first) ──────────────────
  'friends.title': 'With Friends',
  'friends.subtitle': 'Small-group challenges, shared by code.',
  'friends.howItWorks': 'Create a challenge and send the code to friends. They join on their own phone and track their own progress. To compare, everyone shares a score code — the board only updates when someone sends a fresh code. Nothing is automatic, by design.',
  'friends.create': 'Create a challenge',
  'friends.join': 'Join with a code',
  'friends.pasteChallengeCode': 'Paste the challenge code you received',
  'friends.pasteScoreCode': "Paste a friend's score code",
  'friends.addScore': 'Add score',
  'friends.shareInvite': 'Share invite',
  'friends.shareMyScore': 'Share my score',
  'friends.copyCode': 'Copy code',
  'friends.copied': 'Copied',
  'friends.leave': 'Leave',
  'friends.you': 'You',
  'friends.noChallenges': 'No friend challenges yet. Create one above, or join with a code.',
  'friends.daysLeft': '{days} days left',
  'friends.ended': 'Ended',
  'friends.startsOn': 'Starts {date}',
  'friends.boardHint': 'Share your score code to update the board.',
  'friends.durationDays': '{days} days',
  'friends.yourName': 'Your name on the board',
  'friends.challengeJoined': 'Challenge joined. Your progress counts from your own logs.',
  'friends.invalidCode': 'That code does not look right. Check it and try again.',
  'friends.scoreAdded': 'Score added to the board.',
  'friends.scoreWrongChallenge': 'That score code belongs to a different challenge.',

  // ── Crowded-gym mode ────────────────────────────────────────────────
  'packed.toggle': 'Gym packed?',
  'packed.tryInstead': 'Packed gym: try {name} instead',
  'packed.swap': 'Swap',
  'packed.keep': 'Keep',
  'packed.previewHint': 'Pre-swap to dumbbell & bodyweight moves you can do anywhere.',
  'packed.swappedCount': '{count} exercises swapped to dumbbell / bodyweight',
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
