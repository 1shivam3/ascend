import QRCode from 'qrcode';
import { PlannedWorkout, PlannedExercise } from './types';

export interface DecodedProgram {
  name: string;
  exercises: PlannedExercise[];
  coachName?: string;
  notes?: string;
  description?: string;
  goalTag?: string;
  intensityMode?: 'rpe' | 'percent';
}

/**
 * Content signature for duplicate detection: re-importing the same
 * shared link must not mint another copy of the same plan every time.
 */
export function programContentSignature(name: string, exercises: PlannedExercise[]): string {
  const exSig = (exercises || [])
    .map(
      (e) =>
        `${(e.name || '').trim().toLowerCase()}|${e.targetSets ?? ''}|${e.targetReps ?? ''}|${e.targetWeight ?? ''}|${e.targetUnit || 'kg'}|${e.targetRpe ?? ''}`
    )
    .join(';;');
  return `${(name || '').trim().toLowerCase()}::${exSig}`;
}

export function findDuplicateProgram(
  plans: PlannedWorkout[],
  program: DecodedProgram
): PlannedWorkout | undefined {
  const sig = programContentSignature(program.name, program.exercises);
  return (plans || []).find((p) => programContentSignature(p.name, p.exercises) === sig);
}

/**
 * Base64 Unicode encoding helper that safely handles non-ASCII characters
 */
function toBase64Unicode(str: string): string {
  try {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
  } catch {
    return btoa(str);
  }
}

/**
 * Base64 Unicode decoding helper
 */
function fromBase64Unicode(str: string): string {
  try {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(str), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    return atob(str);
  }
}

/**
 * Encodes a PlannedWorkout into a compact URL-safe hash string
 */
export function encodeProgramForSharing(
  plan: PlannedWorkout,
  coachName?: string,
  notes?: string
): string {
  const payload = {
    v: 1, // schema version
    n: plan.name,
    c: coachName || undefined,
    nt: notes || undefined,
    // Plan-level context used to be silently dropped in transit.
    d: plan.description || undefined,
    g: plan.goalTag || undefined,
    im: plan.intensityMode === 'percent' ? 'percent' : undefined,
    ex: plan.exercises.map((e) => ({
      n: e.name,
      s: e.targetSets,
      r: e.targetReps,
      w: e.targetWeight,
      u: e.targetUnit || 'kg',
      rpe: e.targetRpe || undefined,
      nt: e.notes || undefined,
    })),
  };

  const jsonStr = JSON.stringify(payload);
  const base64 = toBase64Unicode(jsonStr);
  // URL-safe replacement
  const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `v1_${urlSafe}`;
}

/**
 * Decodes a URL-safe hash string back into program data
 */
export function decodeProgramFromHash(hashString: string): DecodedProgram | null {
  try {
    let clean = hashString.trim();
    if (clean.startsWith('#')) clean = clean.slice(1);
    if (clean.startsWith('plan=')) clean = clean.slice(5);
    if (clean.startsWith('v1_')) clean = clean.slice(3);

    // Max raw hash length check to prevent memory exhaustion
    if (clean.length > 50000) return null;

    // Revert URL-safe replacements
    let b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }

    const jsonStr = fromBase64Unicode(b64);
    const parsed = JSON.parse(jsonStr);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !parsed.n ||
      !Array.isArray(parsed.ex) ||
      Object.prototype.hasOwnProperty.call(parsed, '__proto__')
    ) {
      return null;
    }

    // Bound exercises array to maximum 50 items
    const rawExercises = parsed.ex.slice(0, 50);

    const exercises: PlannedExercise[] = rawExercises.map((item: any) => {
      const sets = parseInt(String(item?.s), 10);
      const reps = parseInt(String(item?.r), 10);
      const weight = typeof item?.w === 'number' && !isNaN(item.w) ? Math.min(1000, Math.max(0, item.w)) : undefined;

      return {
        name: String(item?.n || 'Exercise').slice(0, 100).trim(),
        targetSets: !isNaN(sets) ? Math.min(30, Math.max(1, sets)) : 3,
        targetReps: !isNaN(reps) ? Math.min(200, Math.max(1, reps)) : 8,
        targetWeight: weight,
        targetUnit: item?.u === 'lbs' ? 'lbs' : 'kg',
        targetRpe:
          typeof item?.rpe === 'number' && !isNaN(item.rpe)
            ? Math.min(10, Math.max(1, item.rpe))
            : undefined,
        notes: item?.nt ? String(item.nt).slice(0, 200).trim() : undefined,
      };
    });

    return {
      name: String(parsed.n).slice(0, 100).trim(),
      coachName: parsed.c ? String(parsed.c).slice(0, 100).trim() : undefined,
      notes: parsed.nt ? String(parsed.nt).slice(0, 500).trim() : undefined,
      description: parsed.d ? String(parsed.d).slice(0, 500).trim() : undefined,
      goalTag: parsed.g ? String(parsed.g).slice(0, 50).trim() : undefined,
      intensityMode: parsed.im === 'percent' ? ('percent' as const) : undefined,
      exercises,
    };
  } catch (err) {
    console.error('Failed to decode program from hash:', err);
    return null;
  }
}

/**
 * Generates an SVG or PNG data URL for a QR Code
 */
export async function generateProgramQRCode(shareUrl: string): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(shareUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: {
        dark: '#0a0a0a',
        light: '#ffffff',
      },
    });
    return dataUrl;
  } catch (err) {
    console.error('Failed to generate QR Code:', err);
    throw err;
  }
}

/**
 * Formats a clean WhatsApp invitation message with ASCII/emoji markers
 */
export function formatWhatsAppShareText(
  plan: PlannedWorkout,
  shareUrl: string,
  coachName?: string,
  notes?: string
): string {
  const coachHeader = coachName ? `Coach ${coachName} shared a program with you:\n\n` : '';
  const notesLine = notes ? `📝 ${notes}\n\n` : '';
  const exList = plan.exercises
    .slice(0, 8)
    .map((e) => {
      const weightLabel = e.targetWeight ? ` @ ${e.targetWeight}${e.targetUnit || 'kg'}` : '';
      const rpeLabel = e.targetRpe ? ` (RPE ${e.targetRpe})` : '';
      return `• *${e.name}*: ${e.targetSets} sets × ${e.targetReps} reps${weightLabel}${rpeLabel}`;
    })
    .join('\n');

  const moreLabel = plan.exercises.length > 8 ? `\n...and ${plan.exercises.length - 8} more exercises` : '';

  return (
    `🏋️ *ASCEND Workout Routine: ${plan.name}*\n` +
    coachHeader +
    notesLine +
    `${exList}${moreLabel}\n\n` +
    `📲 *Open & Import 1-Tap (Free & 100% Offline):*\n` +
    `${shareUrl}\n\n` +
    `_Track your sets, 1RM strength standards, and DOTS scores on ASCEND._`
  );
}
