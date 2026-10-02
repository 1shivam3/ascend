import QRCode from 'qrcode';
import { PlannedWorkout, PlannedExercise } from './types';

export interface DecodedProgram {
  name: string;
  exercises: PlannedExercise[];
  coachName?: string;
  notes?: string;
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
    ex: plan.exercises.map((e) => ({
      n: e.name,
      s: e.targetSets,
      r: e.targetReps,
      w: e.targetWeight,
      u: e.targetUnit || 'kg',
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

    // Revert URL-safe replacements
    let b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }

    const jsonStr = fromBase64Unicode(b64);
    const parsed = JSON.parse(jsonStr);

    if (!parsed || !parsed.n || !Array.isArray(parsed.ex)) {
      return null;
    }

    const exercises: PlannedExercise[] = parsed.ex.map((item: any) => ({
      name: String(item.n || 'Exercise'),
      targetSets: parseInt(String(item.s), 10) || 3,
      targetReps: parseInt(String(item.r), 10) || 8,
      targetWeight: typeof item.w === 'number' && !isNaN(item.w) ? item.w : undefined,
      targetUnit: item.u === 'lbs' ? 'lbs' : 'kg',
      notes: item.nt ? String(item.nt) : undefined,
    }));

    return {
      name: String(parsed.n),
      coachName: parsed.c ? String(parsed.c) : undefined,
      notes: parsed.nt ? String(parsed.nt) : undefined,
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
  coachName?: string
): string {
  const coachHeader = coachName ? `Coach ${coachName} shared a program with you:\n\n` : '';
  const exList = plan.exercises
    .slice(0, 8)
    .map((e) => {
      const weightLabel = e.targetWeight ? ` @ ${e.targetWeight}${e.targetUnit || 'kg'}` : '';
      return `• *${e.name}*: ${e.targetSets} sets × ${e.targetReps} reps${weightLabel}`;
    })
    .join('\n');

  const moreLabel = plan.exercises.length > 8 ? `\n...and ${plan.exercises.length - 8} more exercises` : '';

  return (
    `🏋️ *ASCEND Workout Routine: ${plan.name}*\n` +
    coachHeader +
    `${exList}${moreLabel}\n\n` +
    `📲 *Open & Import 1-Tap (Free & 100% Offline):*\n` +
    `${shareUrl}\n\n` +
    `_Track your sets, 1RM strength standards, and DOTS scores on ASCEND._`
  );
}
