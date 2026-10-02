/**
 * ASCEND Voice Workout Logger (Hinglish + English)
 * 
 * Supports fast, offline, phonetic and regex parsing for gym voice logging:
 * - "bench 80 pe 5, RPE 8"
 * - "80 pe 5" (or STT variants: "80 pay 5", "80 per 5", "80 p 5", "80 ke 5", "80 into 5")
 * - "squat 140 kilo 3 rep rpe 9"
 * - "deadlift 180 pe single"
 * - "100 x 5 rpe 8"
 * - "5 rep 80 kg" (reps first)
 * - "assi pe paanch" / "८० पे ५" (Hindi spoken / Devanagari script)
 * - "bodyweight 10 reps" / "pullups 12 reps"
 * 
 * Includes multi-model Gemini API fallback for rare conversational gym queries.
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

// Exercise alias dictionary for automatic matching across all ASCEND exercises
const EXERCISE_ALIASES: Record<string, string[]> = {
  'Bench Press': ['bench', 'bench press', 'flat bench', 'chest press', 'benchpress'],
  'Incline Bench': ['incline', 'incline bench', 'incline press', 'incline dumbbell', 'incline db'],
  'Close Grip Bench': ['close grip', 'close grip bench', 'cgbp'],
  'Squat': ['squat', 'squats', 'back squat'],
  'Front Squat': ['front squat'],
  'Deadlift': ['deadlift', 'dead lift', 'dead', 'deadlifts', 'dl'],
  'Romanian Deadlift': ['rdl', 'romanian deadlift', 'romanian'],
  'Sumo Deadlift': ['sumo', 'sumo deadlift'],
  'Overhead Press': ['ohp', 'overhead press', 'overhead', 'military press', 'shoulder press', 'strict press'],
  'Barbell Row': ['barbell row', 'bent over row', 'pendlay row', 'pendlay'],
  'Dumbbell Row': ['dumbbell row', 'db row', 'single arm row', 'one arm row'],
  'Dumbbell Press': ['dumbbell press', 'db press', 'dumbbell flat press', 'flat db press'],
  'Dumbbell Curl': ['bicep curl', 'bicep', 'biceps', 'curl', 'dumbbell curl', 'curls', 'db curl'],
  'Hammer Curl': ['hammer curl', 'hammer', 'hammers'],
  'Preacher Curl': ['preacher curl', 'preacher'],
  'Lateral Raise': ['lateral raise', 'side raise', 'lateral', 'laterals', 'side delts'],
  'Tricep Pushdown': ['tricep pushdown', 'pushdown', 'rope pushdown', 'tricep extension', 'triceps', 'tricep'],
  'Pull-ups': ['pullup', 'pull up', 'pull-up', 'pullups', 'chin up', 'chinup', 'chinups'],
  'Dips': ['dip', 'dips', 'chest dip', 'tricep dip'],
  'Leg Press': ['leg press', 'legpress'],
  'Leg Extension': ['leg extension', 'quad extension', 'leg extensions'],
  'Leg Curl': ['leg curl', 'hamstring curl', 'hamstring curls', 'leg curls'],
  'Calf Raise': ['calf raise', 'calf raises', 'calves', 'calf'],
  'Lat Pulldown': ['lat pulldown', 'lat pull', 'pulldown', 'pulldowns'],
  'Cable Row': ['cable row', 'seated row', 'seated cable row'],
  'Face Pull': ['face pull', 'facepull', 'face pulls'],
  'Cable Fly': ['cable fly', 'pec fly', 'chest fly', 'fly', 'flys'],
};

// Hindi Devanagari digit mapping (०-९)
function convertDevanagariDigits(str: string): string {
  const map: Record<string, string> = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  };
  return str.replace(/[०-९]/g, (d) => map[d] || d);
}

// Hindi words (Devanagari) mapped to standard tokens
const HINDI_WORD_REPLACEMENTS: Record<string, string> = {
  // Common gym Hindi connectors
  'पे': 'pe',
  'पर': 'pe',
  'पेय': 'pe',
  'के': 'ke',
  'का': 'ke',
  'में': 'me',
  'से': 'se',
  'किलो': 'kg',
  'केजी': 'kg',
  'पाउंड': 'lbs',
  'रैप': 'rep',
  'रेप': 'rep',
  'रैप्स': 'rep',
  'रेप्स': 'rep',
  'बार': 'rep',
  'दफा': 'rep',
  'सेट': 'set',
  'सिंगल': '1',
  'डबल': '2',
  'ट्रिपल': '3',
  // Hindi numbers (Devanagari script)
  'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4', 'पांच': '5', 'पाँच': '5',
  'छह': '6', 'छः': '6', 'सात': '7', 'आठ': '8', 'नौ': '9', 'दस': '10',
  'ग्यारह': '11', 'बारह': '12', 'तेरह': '13', 'चौदह': '14', 'पंद्रह': '15',
  'सोलह': '16', 'सत्रह': '17', 'अठारह': '18', 'उन्नीस': '19', 'बीस': '20',
  'पच्चीस': '25', 'तीस': '30', 'पैंतीस': '35', 'चालीस': '40', 'पैंतालीस': '45',
  'पचास': '50', 'साठ': '60', 'सत्तर': '70', 'अस्सी': '80', 'पचासी': '85',
  'नब्बे': '90', 'सौ': '100', 'डेढ़': '1.5', 'ढाई': '2.5',
};

// Phonetic English and Romanized Hindi number replacements
const NUMBER_WORDS: Record<string, string> = {
  // English words
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
  'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
  'eighteen': '18', 'nineteen': '19', 'twenty': '20', 'twenty five': '25',
  'thirty': '30', 'thirty five': '35', 'forty': '40', 'forty five': '45',
  'fifty': '50', 'fifty five': '55', 'sixty': '60', 'sixty five': '65',
  'seventy': '70', 'seventy five': '75', 'eighty': '80', 'eighty five': '85',
  'ninety': '90', 'ninety five': '95', 'hundred': '100',
  'single': '1', 'double': '2', 'triple': '3',

  // Hindi romanized words
  'ek': '1', 'do': '2', 'teen': '3', 'chaar': '4', 'char': '4',
  'paanch': '5', 'panch': '5', 'chhe': '6', 'che': '6', 'saat': '7', 'sat': '7',
  'aath': '8', 'ath': '8', 'nau': '9', 'das': '10', 'duss': '10',
  'gyarah': '11', 'barah': '12', 'terah': '13', 'chaudah': '14',
  'pandrah': '15', 'solah': '16', 'satrah': '17', 'atharah': '18',
  'unnis': '19', 'bees': '20', 'pachees': '25', 'pachis': '25',
  'tees': '30', 'paintees': '35', 'chaalis': '40', 'chalis': '40',
  'pachaas': '50', 'pachas': '50', 'saath': '60', 'sath': '60',
  'sattar': '70', 'assi': '80', 'nabbe': '90', 'sau': '100',
  'dedh': '1.5', 'dhai': '2.5', 'aadha': '0.5',
};

/**
 * Normalizes numbers and spoken words in transcript, correcting common STT artifacts
 */
export function normalizeVoiceTranscript(text: string): string {
  let norm = text.toLowerCase().trim();

  // 1. Convert Devanagari digits (e.g. ८० -> 80)
  norm = convertDevanagariDigits(norm);

  // 2. Replace Devanagari words
  for (const [w, repl] of Object.entries(HINDI_WORD_REPLACEMENTS)) {
    norm = norm.replace(new RegExp(w, 'g'), ` ${repl} `);
  }

  // 3. Clean punctuation
  norm = norm.replace(/[,;!\?]/g, ' ');
  norm = norm.replace(/[×\*]/g, ' x ');
  // "80-5" or "80/5" -> "80 pe 5"
  norm = norm.replace(/(\d+)\s*[\-\/]\s*(\d+)/g, '$1 pe $2');

  // 4. Units & Reps
  norm = norm.replace(/\b(kilos?|kgs?|kilo)\b/g, 'kg');
  norm = norm.replace(/\b(pounds?|lbs?)\b/g, 'lbs');
  norm = norm.replace(/\b(reps?|repetition|repetitions|baar|bar|dafa|times)\b/g, 'rep');
  norm = norm.replace(/\b(bodyweight|body weight|khali)\b/g, '0kg');

  // 5. Correct common Speech-to-Text mishearings of the Hinglish connector "pe"
  // STT often transcribes "pe" as "pay", "per", "par", "peh", "pie", "pair", "p", "into", "by", "ke"
  norm = norm.replace(/\b(pay|per|par|peh|pie|pair)\b/g, 'pe');
  norm = norm.replace(/\b(into|in to|times|cross|by)\b/g, 'pe');
  norm = norm.replace(/\b(ke|kay|ka|mein|me|mai|se|say|uthaya|mara|lagaya)\b/g, 'pe');
  // "80 p 5" or "80 p5" -> "80 pe 5"
  norm = norm.replace(/(\d+)\s*p\s*(\d+)/gi, (_m, g1, g2) => `${g1} pe ${g2}`);

  // 6. Number words replacement
  for (const [word, val] of Object.entries(NUMBER_WORDS)) {
    norm = norm.replace(new RegExp(`\\b${word}\\b`, 'gi'), String(val));
  }

  // 7. Collapse spacing
  norm = norm.replace(/\s+/g, ' ').trim();
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

  const normalized = normalizeVoiceTranscript(rawText);

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

  // 2. Detect Set Number if spoken (e.g. "set 2", "second set", "pehla set")
  let setIndex: number | undefined = undefined;
  const setMatch = normalized.match(/\b(?:set|st)\s*(\d+)\b/i);
  if (setMatch) {
    setIndex = parseInt(setMatch[1], 10);
  } else if (/\b(?:pehla|first|1st)\s*set\b/i.test(normalized)) {
    setIndex = 1;
  } else if (/\b(?:doosra|second|2nd)\s*set\b/i.test(normalized)) {
    setIndex = 2;
  } else if (/\b(?:teesra|third|3rd)\s*set\b/i.test(normalized)) {
    setIndex = 3;
  }

  // 3. Detect RPE (e.g. "rpe 8", "rpe 8.5", "rp 8", "rate 8")
  let rpe: number | undefined = undefined;
  const rpeMatch = normalized.match(/\b(?:rpe|rp|rate)\s*(\d+(?:\.\d+)?)\b/i);
  if (rpeMatch) {
    const parsedRpe = parseFloat(rpeMatch[1]);
    if (parsedRpe >= 1 && parsedRpe <= 10) {
      rpe = parsedRpe;
    }
  }

  // Isolate numbers by stripping RPE, set index, and exercise name to avoid interference
  let cleanForNumbers = normalized;
  if (rpeMatch) cleanForNumbers = cleanForNumbers.replace(rpeMatch[0], ' ');
  if (setMatch) cleanForNumbers = cleanForNumbers.replace(setMatch[0], ' ');
  cleanForNumbers = cleanForNumbers.replace(/\b(?:pehla|doosra|teesra|first|second|third|1st|2nd|3rd)\s*set\b/gi, ' ');
  if (matchedExercise) {
    for (const alias of EXERCISE_ALIASES[matchedExercise] || []) {
      cleanForNumbers = cleanForNumbers.replace(new RegExp(`\\b${alias}\\b`, 'gi'), ' ');
    }
  }

  let weight: number | null = null;
  let reps: number | null = null;

  // Pattern 1: Weight + Connector (pe, x, for, at) + Reps
  // "80 pe 5", "82.5 pe 5", "100 x 3", "80 for 5", "80 at 5"
  const p1 = cleanForNumbers.match(/(\d+(?:\.\d+)?)\s*(?:kg|lbs)?\s*(?:pe|x|for|at)\s*(\d+)/i);
  if (p1) {
    weight = parseFloat(p1[1]);
    reps = parseInt(p1[2], 10);
  }

  // Pattern 2: Reps first, then Weight
  // "5 rep 80 kg", "5 rep 80 pe", "5 rep at 80", "5 rep 80"
  if (weight === null || reps === null) {
    const p2 = cleanForNumbers.match(/(\d+)\s*rep\s*(?:pe|at|of|for|with)?\s*(\d+(?:\.\d+)?)/i);
    if (p2) {
      reps = parseInt(p2[1], 10);
      weight = parseFloat(p2[2]);
    }
  }

  // Pattern 3: "5 at 80" (reps at weight)
  if (weight === null || reps === null) {
    const p3 = cleanForNumbers.match(/(\d+)\s*at\s*(\d+(?:\.\d+)?)/i);
    if (p3) {
      reps = parseInt(p3[1], 10);
      weight = parseFloat(p3[2]);
    }
  }

  // Pattern 4: Explicit units: "80 kg 5 rep" or "80 kg 5"
  if (weight === null || reps === null) {
    const p4 = cleanForNumbers.match(/(\d+(?:\.\d+)?)\s*(?:kg|lbs)\s*(\d+)(?:\s*rep)?/i);
    if (p4) {
      weight = parseFloat(p4[1]);
      reps = parseInt(p4[2], 10);
    }
  }

  // Pattern 5: STT heard "80.5" or "80 . 5" where "pe" was misheard as decimal dot
  if (weight === null || reps === null) {
    const p5 = cleanForNumbers.match(/(\d+)\s*\.\s*(\d+)/);
    if (p5) {
      const wCand = parseFloat(p5[1]);
      const rCand = parseInt(p5[2], 10);
      // If whole number is typical bar/dumbbell weight (>= 20) and decimal is typical rep count (1 to 20)
      if (wCand >= 20 && rCand >= 1 && rCand <= 20) {
        weight = wCand;
        reps = rCand;
      }
    }
  }

  // Pattern 6: Two standalone numbers (e.g. "80 5", "bench 80 5")
  if (weight === null || reps === null) {
    const nums = cleanForNumbers.match(/\b\d+(?:\.\d+)?\b/g);
    if (nums && nums.length >= 2) {
      const n1 = parseFloat(nums[0]);
      const n2 = parseFloat(nums[1]);
      // Intelligent orientation check:
      // If first number is <= 25 and second is >= 35, they said reps first (e.g. "5 80")
      if (n1 <= 25 && n2 >= 35) {
        reps = parseInt(String(n1), 10);
        weight = n2;
      } else {
        weight = n1;
        reps = parseInt(String(n2), 10);
      }
    }
  }

  // Pattern 7: Bodyweight with reps e.g. "0kg 10 rep" or "bodyweight 10 reps"
  if ((weight === null || reps === null) && /0kg/i.test(cleanForNumbers)) {
    const rMatch = cleanForNumbers.match(/(\d+)\s*rep/i) || cleanForNumbers.match(/\b\d+\b/);
    if (rMatch) {
      weight = 0;
      reps = parseInt(rMatch[1] || rMatch[0], 10);
    }
  }

  // Validate results
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
 * Creates and starts a continuous SpeechRecognition instance with Indian English or Hindi
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
  recognition.continuous = true; // KEEP LISTENING so phrases aren't cut off prematurely!
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onresult = (event: any) => {
    let fullTranscript = '';
    let hasFinal = false;

    // Accumulate the entire transcript across all result segments
    for (let i = 0; i < event.results.length; ++i) {
      const item = event.results[i];
      if (item && item[0]) {
        fullTranscript += item[0].transcript + ' ';
        if (item.isFinal) {
          hasFinal = true;
        }
      }
    }

    const clean = fullTranscript.trim();
    if (clean) {
      callbacks.onResult(clean, hasFinal);
    }
  };

  recognition.onerror = (event: any) => {
    // 'no-speech' is a normal browser event during natural pauses
    if (event.error === 'no-speech') return;
    callbacks.onError(event.error || 'Speech recognition error');
  };

  recognition.onend = () => {
    callbacks.onEnd();
  };

  return recognition;
}
