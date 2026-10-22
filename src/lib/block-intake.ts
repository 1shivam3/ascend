/**
 * block-intake.ts — the coach's assessment for a training block (PR-B).
 *
 * Pure helpers only (D1): build a prefilled intake from what the app
 * already knows (profile, training profile, athlete model, PRs), and
 * validate a user-edited intake before the block engine consumes it.
 * The UI (CoachBlockModal) asks only for what is missing — everything
 * prefilled here is confirmable in one tap (COACH_DESIGN §4.1).
 *
 * Limitation labels are chosen so the existing injury machinery reads
 * them: getInjuryBannedFamilies() regex-matches free-text limitations
 * (back→hinge, knee→squat, shoulder→vertical_push, hip→hinge,
 * neck→vertical_push, ankle→squat). Elbow/wrist have no safe generic
 * ban — they are recorded and surfaced, never silently dropped.
 */
import type {
  AITrainingProfile,
  AthleteGoal,
  PersonalRecord,
  UserMode,
  UserProfile,
  WorkoutEntry,
} from './types';
import { resolvePrimaryGoal } from './types';
import type { EquipmentAccess } from './workout-engine';
import { estimateE1rmKg, mainCompoundKey } from './percent-1rm';
import type { AthleteModel } from './athlete-model';
import type { MovementFamily } from './exercise-library';

// ─────────────────────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockTopLift {
  /** Main-compound canonical display key (e.g. 'Squat'). */
  name: string;
  e1rmKg: number;
  source: 'pr' | 'history' | 'entered';
}

export interface BlockIntake {
  goal: AthleteGoal;
  daysPerWeek: number; // 2..6
  sessionMinutes: number; // one of SESSION_LENGTH_OPTIONS
  equipment: EquipmentAccess;
  /** Limitation labels — feed getInjuryBannedFamilies + proposal copy. */
  limitations: string[];
  experience: UserMode;
  topLifts: BlockTopLift[];
}

export const SESSION_LENGTH_OPTIONS = [30, 45, 60, 75, 90] as const;

/** The limitation chips offered in step 2 of the intake (§4.1). */
export const LIMITATION_CHIPS: { id: string; label: string }[] = [
  { id: 'shoulder', label: 'Shoulder' },
  { id: 'knee', label: 'Knee' },
  { id: 'low_back', label: 'Low back' },
  { id: 'elbow', label: 'Elbow' },
  { id: 'wrist', label: 'Wrist' },
  { id: 'hip', label: 'Hip' },
  { id: 'ankle', label: 'Ankle' },
  { id: 'neck', label: 'Neck' },
  { id: 'other', label: 'Other' },
];

const CHIP_ID_BY_LABEL = new Map(
  LIMITATION_CHIPS.map((c) => [c.label.toLowerCase(), c.id])
);

/** Map a free-text limitation to a chip id, or null when nothing matches. */
export function limitationChipId(text: string): string | null {
  const clean = (text || '').trim().toLowerCase();
  if (!clean) return null;
  if (CHIP_ID_BY_LABEL.has(clean)) return CHIP_ID_BY_LABEL.get(clean)!;
  if (/shoulder|rotator|imping/.test(clean)) return 'shoulder';
  if (/knee|meniscus|acl|patella/.test(clean)) return 'knee';
  if (/back|spine|disc|lumbar|sciatica/.test(clean)) return 'low_back';
  if (/elbow|tennis elbow|golfer/.test(clean)) return 'elbow';
  if (/wrist|carpal/.test(clean)) return 'wrist';
  if (/hip|groin/.test(clean)) return 'hip';
  if (/ankle|achilles/.test(clean)) return 'ankle';
  if (/neck|cervical/.test(clean)) return 'neck';
  return 'other';
}

const CHIP_LABEL_BY_ID = new Map(LIMITATION_CHIPS.map((c) => [c.id, c.label]));

/** Canonical label for a chip id (unknown ids pass through untouched). */
export function limitationLabel(chipId: string): string {
  return CHIP_LABEL_BY_ID.get(chipId) ?? chipId;
}

/**
 * Movement families → the intake chips that plausibly cover them. Used
 * to pre-tick chips when the athlete model has flagged a pain family
 * (D6): families with no chip mapping (horizontal patterns, carry,
 * core) still get excluded by the engine directly — the chip is only
 * the explainable surface.
 */
const FAMILY_CHIP_IDS: Partial<Record<MovementFamily, string[]>> = {
  hinge: ['low_back', 'hip'],
  squat: ['knee', 'ankle'],
  vertical_push: ['shoulder', 'neck'],
};

export interface IntakePrefill {
  intake: BlockIntake;
  /** Plain-English provenance per prefilled field (D4: evidence as data). */
  notes: { field: string; text: string }[];
  /** Chips pre-ticked because the athlete model flagged the family. */
  flaggedChips: { chipId: string; reason: string }[];
}

function snapSessionMinutes(min: number | undefined): number {
  if (!min || !Number.isFinite(min) || min <= 0) return 60;
  let best: number = SESSION_LENGTH_OPTIONS[0];
  for (const opt of SESSION_LENGTH_OPTIONS) {
    if (Math.abs(opt - min) < Math.abs(best - min)) best = opt;
  }
  return best;
}

const MAIN_LIFT_KEYS = [
  'Squat',
  'Bench Press',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
  'Front Squat',
  'Incline Bench',
  'Romanian Deadlift',
  'Sumo Deadlift',
] as const;

/**
 * Build the prefilled intake. Pure: the modal renders this, the user
 * confirms/edits, and the result feeds generateBlockProposal().
 */
export function buildIntakePrefill(input: {
  profile: UserProfile | null;
  trainingProfile: AITrainingProfile | null;
  athleteModel: AthleteModel | null;
  prs: PersonalRecord[];
  workouts: WorkoutEntry[];
}): IntakePrefill {
  const { profile, trainingProfile, athleteModel, prs, workouts } = input;
  const notes: { field: string; text: string }[] = [];

  const goal = resolvePrimaryGoal(profile?.goals);
  if (profile?.goals && profile.goals.length > 0) {
    notes.push({ field: 'goal', text: 'From your profile goals — change it if this block has a different job.' });
  }

  const rawDays = trainingProfile?.daysPerWeek ?? 3;
  const daysPerWeek = Math.min(6, Math.max(2, Math.round(rawDays) || 3));
  notes.push({
    field: 'daysPerWeek',
    text: `You currently train ${daysPerWeek} day${daysPerWeek === 1 ? '' : 's'} a week — the block keeps that rhythm.`,
  });

  const sessionMinutes = snapSessionMinutes(trainingProfile?.preferredDurationMin);
  const equipment: EquipmentAccess = trainingProfile?.equipment ?? 'full_gym';
  const experience: UserMode =
    trainingProfile?.experience ?? profile?.userMode ?? 'intermediate';

  // Limitations: keep the user's own words (they feed the ban regexes),
  // de-duplicated case-insensitively.
  const limitations: string[] = [];
  const seenLim = new Set<string>();
  for (const raw of trainingProfile?.injuriesOrLimitations ?? []) {
    const clean = (raw || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seenLim.has(key)) continue;
    seenLim.add(key);
    limitations.push(clean);
  }

  // Pain-flagged families (PR-A, D6) pre-tick the covering chips.
  const flaggedChips: { chipId: string; reason: string }[] = [];
  const flagged = athleteModel?.pain.flaggedFamilies ?? [];
  for (const family of flagged) {
    const chips = FAMILY_CHIP_IDS[family] ?? [];
    const count = athleteModel?.pain.episodesLast28dByFamily[family] ?? 0;
    for (const chipId of chips) {
      const label = limitationLabel(chipId);
      if (!limitations.some((l) => l.toLowerCase() === label.toLowerCase())) {
        limitations.push(label);
      }
      if (!flaggedChips.some((f) => f.chipId === chipId)) {
        flaggedChips.push({
          chipId,
          reason: `You reported pain on ${family.replace('_', ' ')} movements ${count} times in the last 28 days, so this area starts ticked — untick it if it has settled.`,
        });
      }
    }
    if (chips.length === 0) {
      notes.push({
        field: 'limitations',
        text: `Your ${family.replace('_', ' ')} movements are excluded from this block — you reported pain there ${count} times in the last 28 days.`,
      });
    }
  }

  // Top lifts: e1RM from PRs first, workout history second (§ percent-1rm).
  const topLifts: BlockTopLift[] = [];
  for (const key of MAIN_LIFT_KEYS) {
    const e1rm = estimateE1rmKg(key, prs, workouts);
    if (!e1rm || e1rm <= 0) continue;
    const fromPr = (prs || []).some(
      (pr) => mainCompoundKey(pr.exercise) === key && (pr.oneRepMax > 0 || pr.weightKg > 0)
    );
    topLifts.push({ name: key, e1rmKg: e1rm, source: fromPr ? 'pr' : 'history' });
  }
  if (topLifts.length > 0) {
    notes.push({
      field: 'topLifts',
      text: 'Estimated from your logged lifts — edit any number that looks off, or skip and the first week calibrates it.',
    });
  } else {
    notes.push({
      field: 'topLifts',
      text: 'No logged maxes yet — starting loads use conservative defaults and week 1 calibrates them.',
    });
  }

  return {
    intake: { goal, daysPerWeek, sessionMinutes, equipment, limitations, experience, topLifts },
    notes,
    flaggedChips,
  };
}

/** Problems that must be fixed before a block can be generated. */
export function validateIntake(intake: BlockIntake): string[] {
  const problems: string[] = [];
  if (!intake || typeof intake !== 'object') return ['Intake is missing.'];
  if (!Number.isFinite(intake.daysPerWeek) || intake.daysPerWeek < 2 || intake.daysPerWeek > 6) {
    problems.push('Pick between 2 and 6 training days a week.');
  }
  if (!SESSION_LENGTH_OPTIONS.includes(intake.sessionMinutes as (typeof SESSION_LENGTH_OPTIONS)[number])) {
    problems.push('Pick a session length.');
  }
  if (!intake.goal) problems.push('Pick a goal for this block.');
  for (const lift of intake.topLifts || []) {
    if (lift.e1rmKg !== undefined && (!Number.isFinite(lift.e1rmKg) || lift.e1rmKg < 0)) {
      problems.push(`The estimate for ${lift.name} does not look right — fix or clear it.`);
    }
  }
  return problems;
}
