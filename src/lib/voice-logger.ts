/**
 * ASCEND Voice Workout Logger (Hinglish + English)
 * 
 * Supports fast local regex parsing for phrases like:
 * - "bench 80 pe 5, RPE 8"
 * - "80 pe 5"
 * - "squat 140 kilo 3 rep rpe 9"
 * - "deadlift 180 pe single"
 * - "100 x 5 rpe 8"
 * 
 * With optional Gemini API fallback for complex gym slang.
 */

export interface VoiceWorkoutResult {
  exerciseName?: string;
  weight: number;
  reps: number;
  rpe?: number;
  setIndex?: number; // 1-based set number if spoken (e.g. "set 2")
  confidence: 'high' | 'medium' | 'low';
  rawTranscript: string;
  summary: string;
}

// Exercise alias dictionary for automatic matching
const EXERCISE_ALIASES: Record<string, string[]> = {
  'Bench Press': ['bench', 'bench press', 'flat bench', 'benchpress'],
  'Incline Bench': ['incline', 'incline bench', 'incline press', 'incline dumbbell'],
  'Squat': ['squat', 'squats', 'back squat'],
  'Deadlift': ['deadlift', 'dead', 'deadlifts', 'dl'],
  'Overhead Press': ['ohp', 'overhead press', 'overhead', 'military press', 'shoulder press'],
  'Barbell Row': ['row', 'barbell row', 'bent over row', 'pendlay'],
  'Pull-ups': ['pullup', 'pull up', 'pull-up', 'pullups', 'chin up', 'chinup'],
  'Dips': ['dip', 'dips', 'chest dip', 'tricep dip'],
  'Dumbbell Curl': ['bicep curl', 'bicep', 'biceps', 'curl', 'dumbbell curl', 'curls'],
  'Leg Press': ['leg press', 'legpress'],
  'Romanian Deadlift': ['rdl', 'romanian deadlift', 'romanian'],
  'Lat Pulldown': ['lat pulldown', 'lat pull', 'pulldown'],
};

// Hindi numeric phonetic replacements
const HINDI_NUMBERS: Record<string, number> = {
  'ek': 1, 'one': 1,
  'do': 2, 'two': 2,
  'teen': 3, 'three': 3,
  'char': 4, 'chaar': 4, 'four': 4,
  'paanch': 5, 'panch': 5, 'five': 5,
  'chhe': 6, 'che': 6, 'six': 6,
  'saat': 7, 'seven': 7,
  'aath': 8, 'eight': 8,
  'nau': 9, 'nine': 9,
  'das': 10, 'ten': 10,
  'gyarah': 11,
  'barah': 12,
  'terah': 13,
  'chaudah': 14,
  'pandrah': 15,
  'solah': 16,
  'satrah': 17,
  'atharah': 18,
  'unnis': 19,
  'bees': 20,
  'single': 1,
  'double': 2,
  'triple': 3,
  'sau': 100,
};

/**
 * Normalizes numbers and spoken words in transcript
 */
function normalizeTranscript(text: string): string {
  let norm = text.toLowerCase().trim();
  
  // Replace symbols and common speech artifacts
  norm = norm.replace(/[,\-\/]/g, ' ');
  norm = norm.replace(/\b(kilos?|kgs?)\b/g, 'kg');
  norm = norm.replace(/\b(pounds?|lbs?)\b/g, 'lbs');
  norm = norm.replace(/\b(bar|baar|dawa|dafa)\b/g, 'rep');
  norm = norm.replace(/\b(reps?|repetition|repetitions)\b/g, 'rep');

  // Replace common Hindi number words if they appear as standalone tokens
  for (const [word, val] of Object.entries(HINDI_NUMBERS)) {
    const reg = new RegExp(`\\b${word}\\b`, 'g');
    norm = norm.replace(reg, String(val));
  }

  return norm;
}

/**
 * High-speed local regex parser for Hinglish gym logs
 */
export function parseHinglishWorkoutVoice(
  rawText: string,
  fallbackExerciseName?: string,
  defaultUnit: 'kg' | 'lbs' = 'kg'
): VoiceWorkoutResult | null {
  if (!rawText || !rawText.trim()) return null;

  const normalized = normalizeTranscript(rawText);

  // 1. Detect Exercise Name if spoken
  let matchedExercise: string | undefined = undefined;
  for (const [canonical, aliases] of Object.entries(EXERCISE_ALIASES)) {
    for (const alias of aliases) {
      const aliasReg = new RegExp(`\\b${alias}\\b`, 'i');
      if (aliasReg.test(normalized)) {
        matchedExercise = canonical;
        break;
      }
    }
    if (matchedExercise) break;
  }

  const effectiveExercise = matchedExercise || fallbackExerciseName;

  // 2. Detect Set Number if spoken (e.g. "set 2", "second set")
  let setIndex: number | undefined = undefined;
  const setMatch = normalized.match(/\bset\s*(\d+)\b/i);
  if (setMatch) {
    setIndex = parseInt(setMatch[1], 10);
  }

  // 3. Detect RPE (e.g. "rpe 8", "rpe 8.5", "rpe 9")
  let rpe: number | undefined = undefined;
  const rpeMatch = normalized.match(/\brpe\s*(\d+(?:\.\d+)?)\b/i);
  if (rpeMatch) {
    const parsedRpe = parseFloat(rpeMatch[1]);
    if (parsedRpe >= 1 && parsedRpe <= 10) {
      rpe = parsedRpe;
    }
  }

  // 4. Weight and Reps extraction using multiple resilient patterns:
  let weight: number | null = null;
  let reps: number | null = null;

  // Pattern A: "80 pe 5", "80 per 5", "80 par 5", "80 x 5", "80 * 5"
  const peMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:kg|lbs)?\s*(?:pe|per|par|x|\*)\s*(\d+)/i);
  if (peMatch) {
    weight = parseFloat(peMatch[1]);
    reps = parseInt(peMatch[2], 10);
  }

  // Pattern B: "80 kg 5 rep", "80 kilo 5"
  if (weight === null || reps === null) {
    const kgRepMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:kg|lbs)\s*(\d+)(?:\s*rep)?/i);
    if (kgRepMatch) {
      weight = parseFloat(kgRepMatch[1]);
      reps = parseInt(kgRepMatch[2], 10);
    }
  }

  // Pattern C: "weight 80 reps 5" or "80 kg for 5 reps"
  if (weight === null || reps === null) {
    const weightMatch = normalized.match(/(?:weight\s*)?(\d+(?:\.\d+)?)\s*(?:kg|lbs)?\s*(?:for\s*)?(\d+)\s*rep/i);
    if (weightMatch) {
      weight = parseFloat(weightMatch[1]);
      reps = parseInt(weightMatch[2], 10);
    }
  }

  // Pattern D: Two plain numbers e.g. "80 5" (where first is typically weight, second is reps)
  if (weight === null || reps === null) {
    // Strip exercise name, set number, and rpe first to isolate remaining numbers
    let remaining = normalized;
    if (setMatch) remaining = remaining.replace(setMatch[0], '');
    if (rpeMatch) remaining = remaining.replace(rpeMatch[0], '');
    if (matchedExercise) {
      for (const alias of EXERCISE_ALIASES[matchedExercise] || []) {
        remaining = remaining.replace(new RegExp(`\\b${alias}\\b`, 'gi'), '');
      }
    }

    const numbers = remaining.match(/\b\d+(?:\.\d+)?\b/g);
    if (numbers && numbers.length >= 2) {
      const n1 = parseFloat(numbers[0]);
      const n2 = parseInt(numbers[1], 10);
      // Reasonable heuristics: weight usually >= 5kg (unless reps), reps usually <= 50
      if (n1 >= 2.5 && n2 >= 1 && n2 <= 60) {
        weight = n1;
        reps = n2;
      }
    }
  }

  // If we found valid weight and reps, return high confidence
  if (weight !== null && reps !== null && !isNaN(weight) && !isNaN(reps) && weight >= 0 && reps > 0) {
    const exLabel = effectiveExercise ? `${effectiveExercise}: ` : '';
    const rpeLabel = rpe ? ` • RPE ${rpe}` : '';
    const summary = `${exLabel}${weight}${defaultUnit} × ${reps} reps${rpeLabel}`;

    return {
      exerciseName: effectiveExercise,
      weight,
      reps,
      rpe,
      setIndex,
      confidence: 'high',
      rawTranscript: rawText,
      summary,
    };
  }

  return null;
}

/**
 * Checks whether Web Speech API is supported in the current browser
 */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

/**
 * Creates and starts a SpeechRecognition instance with Indian English by default
 */
export function createSpeechRecognizer(callbacks: {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError: (error: string) => void;
  onEnd: () => void;
  lang?: string;
}) {
  if (typeof window === 'undefined') return null;

  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  // 'en-IN' (Indian English) handles Hinglish words like "pe", "mara", "sau", "kilo" best
  recognition.lang = callbacks.lang || 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    if (final) {
      callbacks.onResult(final.trim(), true);
    } else if (interim) {
      callbacks.onResult(interim.trim(), false);
    }
  };

  recognition.onerror = (event: any) => {
    callbacks.onError(event.error || 'Speech recognition error');
  };

  recognition.onend = () => {
    callbacks.onEnd();
  };

  return recognition;
}
