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

  // ── Run program (Couch to 5K) ────────────────────────────────────────
  'run.title': 'Running',
  'run.programName': 'Couch to 5K',
  'run.programDesc': 'An 8-week run/walk program: 3 runs a week, building to 30 minutes of continuous running.',
  'run.startProgram': 'Start program',
  'run.leaveProgram': 'Leave program',
  'run.restartProgram': 'Restart program',
  'run.weekOf': 'Week {week} of 8',
  'run.sessionsDone': '{done} of {total} runs done',
  'run.nextRun': 'Next run',
  'run.startRun': 'Start run',
  'run.programComplete': 'Program complete — you built up to 30-minute runs.',
  'run.warmup': 'Warm-up walk',
  'run.runPhase': 'Run',
  'run.walkPhase': 'Walk',
  'run.cooldown': 'Cool-down walk',
  'run.pause': 'Pause',
  'run.resume': 'Resume',
  'run.skipPhase': 'Skip',
  'run.endRun': 'End run',
  'run.runComplete': 'Run complete',
  'run.distanceLabel': 'Distance in km (optional)',
  'run.saveRun': 'Save run',
  'run.intervalsDone': '{done} of {total} intervals done',
  'run.nextUp': 'Next: {label}',
  'run.sessionLabel': 'Week {week} · Run {day}',
  'run.saved': 'Run logged. It counts toward your streak.',

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
  'confirm.confirm': 'Confirm',
  'confirm.typeToConfirm': 'Type {word} to confirm:',
  'state.loadingLabel': 'Loading...',
  'state.loadingDesc': 'Please wait while we load your data.',
  'state.errorTitle': 'Something went wrong',
  'state.errorMessage': 'An unexpected error occurred while loading this view. Your logged workouts, PRs, and personal records remain safely stored.',
  'state.noDiagnostics': 'No technical diagnostics details provided.',
  'state.diagnostics': 'Technical Diagnostics',
  'state.digest': 'Digest:',
  'state.retry': 'Retry',
  'state.returnHome': 'Return to Dashboard',
  'state.emergencyReset': 'Clear temporary cache & force restart',
  'offline.badge': 'Offline Gym Mode Active',
  'offline.title': 'You\'re Offline',
  'offline.desc': 'No internet connection detected. Offline Gym Mode is active — you can continue logging workouts, PRs, and meals locally without interruption.',
  'offline.localTitle': 'Local Logging Active',
  'offline.localDesc': 'All workouts, sets, and meals save safely to device storage.',
  'offline.engineTitle': 'Full Gym Engine',
  'offline.engineDesc': 'Rest timers, 1RM calculators, and routines work 100% offline.',
  'offline.syncTitle': 'Automatic Cloud Sync',
  'offline.syncDesc': 'Queued changes automatically upload once connectivity returns.',
  'offline.checking': 'Checking Network...',
  'offline.check': 'Check Connection',
  'offline.continue': 'Continue in Gym Mode',
  'offline.toastOnlineMsg': 'Connection restored! Cloud sync resumed.',
  'offline.toastOnlineTitle': 'Back Online',
  'offline.toastOfflineMsg': 'Still offline. Local gym mode remains fully operational.',
  'offline.toastOfflineTitle': 'Offline Mode',
  'offline.toastFailMsg': 'Network check failed. You can keep training offline.',
  'offline.toastFailTitle': 'Offline',
  'telemetry.ariaLabel': 'Privacy & Analytics Preferences',
  'telemetry.title': 'Privacy & Performance',
  'telemetry.closeAria': 'Close and decline analytics',
  'telemetry.body': 'ASCEND uses anonymous telemetry to detect crashes and optimize loading speeds. In accordance with our offline-first architecture, your workout logs, PRs, body measurements, and meals are never tracked.',
  'telemetry.decline': 'Decline',
  'telemetry.accept': 'Accept',
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
