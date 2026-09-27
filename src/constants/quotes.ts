export type QuoteCategory =
  | 'DAILY'
  | 'PRE_WORKOUT'
  | 'DURING_TRAINING'
  | 'REST'
  | 'PR'
  | 'LEVEL_UP'
  | 'RANK_UP'
  | 'MILESTONE'
  | 'DIFFICULT_DAYS'
  | 'CHALLENGE'
  | 'JOURNEY';

export interface AscendQuote {
  id: string;
  category: QuoteCategory;
  text: string;
}

export const ASCEND_QUOTES: AscendQuote[] = [
  // Daily / Mentality
  { id: 'daily_001', category: 'DAILY', text: "Your future strength is built in today's work." },
  { id: 'daily_002', category: 'DAILY', text: "The next level starts before you feel ready." },
  { id: 'daily_003', category: 'DAILY', text: "Progress does not require perfection." },
  { id: 'daily_004', category: 'DAILY', text: "Small victories compound." },
  { id: 'daily_005', category: 'DAILY', text: "Your habits decide your level." },
  { id: 'daily_006', category: 'DAILY', text: "Train today. Thank yourself later." },
  { id: 'daily_007', category: 'DAILY', text: "Consistency is a hidden superpower." },
  { id: 'daily_008', category: 'DAILY', text: "Every session leaves a mark." },
  { id: 'daily_009', category: 'DAILY', text: "You don't need perfect conditions." },
  { id: 'daily_010', category: 'DAILY', text: "Show up. Then improve." },
  { id: 'daily_011', category: 'DAILY', text: "The journey is measured in repetitions." },
  { id: 'daily_012', category: 'DAILY', text: "Earn tomorrow with today's effort." },
  { id: 'daily_013', category: 'DAILY', text: "Make progress inevitable." },
  { id: 'daily_014', category: 'DAILY', text: "Your standard is your ceiling." },
  { id: 'daily_015', category: 'DAILY', text: "Discipline survives motivation." },
  { id: 'daily_016', category: 'DAILY', text: "One more session changes the trend." },
  { id: 'daily_017', category: 'DAILY', text: "Build the version of you that you respect." },
  { id: 'daily_018', category: 'DAILY', text: "The work counts even when nobody sees it." },
  { id: 'daily_019', category: 'DAILY', text: "Your level reflects your actions." },
  { id: 'daily_020', category: 'DAILY', text: "Keep climbing." },

  // Pre-workout
  { id: 'pre_001', category: 'PRE_WORKOUT', text: "The next level begins with the first set." },
  { id: 'pre_002', category: 'PRE_WORKOUT', text: "Enter with a plan. Leave with progress." },
  { id: 'pre_003', category: 'PRE_WORKOUT', text: "Today has a mission." },
  { id: 'pre_004', category: 'PRE_WORKOUT', text: "The work starts now." },
  { id: 'pre_005', category: 'PRE_WORKOUT', text: "Prepare. Execute. Ascend." },
  { id: 'pre_006', category: 'PRE_WORKOUT', text: "Leave excuses outside." },
  { id: 'pre_007', category: 'PRE_WORKOUT', text: "Focus on the next set." },
  { id: 'pre_008', category: 'PRE_WORKOUT', text: "Today's effort becomes tomorrow's baseline." },
  { id: 'pre_009', category: 'PRE_WORKOUT', text: "Your quest is waiting." },
  { id: 'pre_010', category: 'PRE_WORKOUT', text: "Make this session count." },

  // During training
  { id: 'train_001', category: 'DURING_TRAINING', text: "One set at a time." },
  { id: 'train_002', category: 'DURING_TRAINING', text: "Control the movement." },
  { id: 'train_003', category: 'DURING_TRAINING', text: "Own the repetition." },
  { id: 'train_004', category: 'DURING_TRAINING', text: "Quality before quantity." },
  { id: 'train_005', category: 'DURING_TRAINING', text: "Stay focused." },
  { id: 'train_006', category: 'DURING_TRAINING', text: "The weight is only part of the challenge." },
  { id: 'train_007', category: 'DURING_TRAINING', text: "Strong reps build strong habits." },
  { id: 'train_008', category: 'DURING_TRAINING', text: "Don't rush the work." },
  { id: 'train_009', category: 'DURING_TRAINING', text: "Finish what you started." },
  { id: 'train_010', category: 'DURING_TRAINING', text: "Progress lives in the details." },

  // Rest
  { id: 'rest_001', category: 'REST', text: "Recover. Then return stronger." },
  { id: 'rest_002', category: 'REST', text: "Rest is part of the quest." },
  { id: 'rest_003', category: 'REST', text: "Breathe. Reset. Execute." },
  { id: 'rest_004', category: 'REST', text: "The next set deserves your best." },
  { id: 'rest_005', category: 'REST', text: "Recovery is preparation." },
  { id: 'rest_006', category: 'REST', text: "Strength is built between efforts too." },
  { id: 'rest_007', category: 'REST', text: "Refocus." },
  { id: 'rest_008', category: 'REST', text: "The pause is part of the process." },
  { id: 'rest_009', category: 'REST', text: "Reset your mind." },
  { id: 'rest_010', category: 'REST', text: "You're not done yet." },

  // PR
  { id: 'pr_001', category: 'PR', text: "Proof is stronger than promises." },
  { id: 'pr_002', category: 'PR', text: "A new record changes the standard." },
  { id: 'pr_003', category: 'PR', text: "You just moved the line." },
  { id: 'pr_004', category: 'PR', text: "The number is real. You earned it." },
  { id: 'pr_005', category: 'PR', text: "Another boundary broken." },
  { id: 'pr_006', category: 'PR', text: "Today’s limit became yesterday’s limit." },
  { id: 'pr_007', category: 'PR', text: "New record. New baseline." },
  { id: 'pr_008', category: 'PR', text: "The work finally showed." },
  { id: 'pr_009', category: 'PR', text: "That number belongs to you now." },
  { id: 'pr_010', category: 'PR', text: "You earned the upgrade." },

  // Level up
  { id: 'lvl_001', category: 'LEVEL_UP', text: "You earned this level. Now make it matter." },
  { id: 'lvl_002', category: 'LEVEL_UP', text: "Level increased. Expectations increased too." },
  { id: 'lvl_003', category: 'LEVEL_UP', text: "You are not where you started." },
  { id: 'lvl_004', category: 'LEVEL_UP', text: "Another level conquered." },
  { id: 'lvl_005', category: 'LEVEL_UP', text: "The system noticed your work." },
  { id: 'lvl_006', category: 'LEVEL_UP', text: "Progress has been recorded." },
  { id: 'lvl_007', category: 'LEVEL_UP', text: "Your effort just became permanent." },
  { id: 'lvl_008', category: 'LEVEL_UP', text: "Keep climbing." },
  { id: 'lvl_009', category: 'LEVEL_UP', text: "One level closer." },
  { id: 'lvl_010', category: 'LEVEL_UP', text: "The journey continues." },

  // Rank up
  { id: 'rnk_001', category: 'RANK_UP', text: "The standard has changed." },
  { id: 'rnk_002', category: 'RANK_UP', text: "A higher rank demands higher discipline." },
  { id: 'rnk_003', category: 'RANK_UP', text: "You crossed the threshold." },
  { id: 'rnk_004', category: 'RANK_UP', text: "Your previous limit is now your warm-up." },
  { id: 'rnk_005', category: 'RANK_UP', text: "Rank increased. The journey gets harder." },
  { id: 'rnk_006', category: 'RANK_UP', text: "You earned your place here." },
  { id: 'rnk_007', category: 'RANK_UP', text: "The next gate is waiting." },
  { id: 'rnk_008', category: 'RANK_UP', text: "A new chapter begins." },
  { id: 'rnk_009', category: 'RANK_UP', text: "Strength got you here. Discipline takes you further." },
  { id: 'rnk_010', category: 'RANK_UP', text: "Ascend." },

  // Milestones
  { id: 'mls_001', category: 'MILESTONE', text: "Milestone unlocked." },
  { id: 'mls_002', category: 'MILESTONE', text: "Another marker on the journey." },
  { id: 'mls_003', category: 'MILESTONE', text: "You reached the target." },
  { id: 'mls_004', category: 'MILESTONE', text: "Progress becomes history." },
  { id: 'mls_005', category: 'MILESTONE', text: "Another checkpoint conquered." },
  { id: 'mls_006', category: 'MILESTONE', text: "The path is getting longer behind you." },
  { id: 'mls_007', category: 'MILESTONE', text: "Your journey has evidence now." },
  { id: 'mls_008', category: 'MILESTONE', text: "One more milestone. Keep moving." },
  { id: 'mls_009', category: 'MILESTONE', text: "You built this result." },
  { id: 'mls_010', category: 'MILESTONE', text: "Remember where this started." },

  // Difficult days / missed workouts
  { id: 'dif_001', category: 'DIFFICULT_DAYS', text: "You don't need to dominate today. You need to continue." },
  { id: 'dif_002', category: 'DIFFICULT_DAYS', text: "A difficult session still counts." },
  { id: 'dif_003', category: 'DIFFICULT_DAYS', text: "Bad days are part of strong journeys." },
  { id: 'dif_004', category: 'DIFFICULT_DAYS', text: "Reduce the goal. Don't abandon the journey." },
  { id: 'dif_005', category: 'DIFFICULT_DAYS', text: "Progress isn't always visible." },
  { id: 'dif_006', category: 'DIFFICULT_DAYS', text: "Return stronger when you're ready." },
  { id: 'dif_007', category: 'DIFFICULT_DAYS', text: "One setback doesn't rewrite your story." },
  { id: 'dif_008', category: 'DIFFICULT_DAYS', text: "Keep the streak of returning." },
  { id: 'dif_009', category: 'DIFFICULT_DAYS', text: "You can restart without starting over." },
  { id: 'dif_010', category: 'DIFFICULT_DAYS', text: "Tomorrow is another chance to ascend." },
];
