import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

type AITaskType =
  | 'COACH_INSIGHT'
  | 'GENERATE_DAILY_PLAN'
  | 'SUBSTITUTE_EXERCISE'
  | 'WORKOUT_COMMAND'
  | 'POST_WORKOUT_TAKE'
  | 'WEEKLY_REVIEW';

interface CoachRequestBody {
  task?: AITaskType;
  customApiKey?: string;
  userContext?: string; // High-signal compact context from buildCompactUserContext

  // Specific payloads depending on task
  profile?: {
    name?: string;
    gender?: 'male' | 'female';
    bodyweightKg?: number;
    unit?: 'kg' | 'lbs';
  };
  metrics?: {
    volumeThisWeekKg: number;
    volumeLastWeekKg: number;
    volumeDiffPercent: number;
    consecutiveWorkoutDays: number;
    daysSinceLastWorkout: number;
    waterMlToday: number;
    waterTargetMl: number;
    creatineTakenToday: boolean;
    creatineStreakDays: number;
    proteinGToday: number;
    proteinTargetG: number;
  };
  recentWorkouts?: Array<{
    date: string;
    exercises: Array<{
      name: string;
      sets: Array<{ reps: number; weight: number; unit: string }>;
    }>;
  }>;
  topPRs?: Array<{
    exercise: string;
    oneRepMax: number;
  }>;

  // For SUBSTITUTE_EXERCISE
  substitution?: {
    exerciseToReplace: string;
    reasonOption: string;
    currentWorkoutExercises?: string[];
  };

  // For WORKOUT_COMMAND
  command?: {
    instruction: string;
    activeWorkout?: {
      name: string;
      exercises: Array<{
        name: string;
        sets: Array<{ reps: number; weight: number; unit: string }>;
      }>;
    };
  };

  // For POST_WORKOUT_TAKE
  completedWorkout?: {
    name: string;
    durationMinutes: number;
    exercises: Array<{
      name: string;
      sets: Array<{ reps: number; weight: number; unit: string }>;
    }>;
  };

  // For WEEKLY_REVIEW
  weeklyStats?: {
    workoutsCompleted: number;
    plannedDays: number;
    waterAvgLiters: number;
    creatineDays: number;
  };
}

import fs from 'fs';
import path from 'path';

function getResolvedApiKey(headerKey?: string | null, bodyKey?: string | null): string | undefined {
  if (headerKey && headerKey.trim()) return headerKey.trim();
  if (bodyKey && bodyKey.trim()) return bodyKey.trim();

  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim()) {
    return process.env.GOOGLE_API_KEY.trim();
  }

  const envFiles = ['.env.local', '.env', '.env.production.local', '.env.development.local'];
  for (const envFile of envFiles) {
    try {
      const filePath = path.resolve(process.cwd(), envFile);
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('GEMINI_API_KEY=') || trimmed.startsWith('GOOGLE_API_KEY=')) {
            const val = trimmed.split('=')[1]?.trim().replace(/^['"]|['"]$/g, '');
            if (val) return val;
          }
        }
      }
    } catch {
      // Ignore filesystem errors
    }
  }

  return undefined;
}

export async function POST(req: Request) {
  try {
    const headerKey = req.headers.get('x-gemini-api-key');
    const body: CoachRequestBody = await req.json();
    const task = body.task || 'COACH_INSIGHT';

    const apiKey = getResolvedApiKey(headerKey, body.customApiKey);

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'NO_API_KEY',
          message:
            'No Gemini API key provided. Please configure GEMINI_API_KEY in your environment or enter your personal key in Settings.',
        },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Fallback model list in order of tested performance
    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash',
    ];

    let systemInstruction = '';
    let promptText = '';

    const baseGuardrails = `You are ASCEND's fitness coaching intelligence engine.
Rules:
- Ground all recommendations in the user's actual logged workout and habit history.
- Never invent imaginary workout data or fake past numbers.
- Keep output extremely concise, actionable, and free of generic motivational filler.
- Always output strictly valid JSON matching the requested schema.
- Creatine guideline: 5g/day is the standard daily maintenance dose. True loading is ~20g/day for 5-7 days. Never recommend "creatine loading (5g/day)"; say "start 5g/day" or "daily maintenance (5g/day)".`;

    if (task === 'GENERATE_DAILY_PLAN') {
      systemInstruction = `${baseGuardrails}
Job: Generate today's structured workout plan based on the user's recent training, progressive overload history, split, and recovery status.
Do NOT generate a random workout. Maintain continuity with past weights and reps.
Schema:
{
  "workoutName": "e.g. Upper Body Strength",
  "estimatedDurationMin": 50,
  "focus": "e.g. Bench Overload & Upper Back",
  "whyThisWorkout": "1-2 concise sentences explaining why this specific session is planned based on their past lifts and rest days",
  "exercises": [
    {
      "exercise": "Standard exercise name",
      "sets": 3,
      "reps": "6-8",
      "targetWeightKg": 70,
      "restSeconds": 120,
      "reason": "1 short sentence rationale for this exercise and load"
    }
  ]
}`;
      promptText = `Athlete Data & Training History:\n${body.userContext || ''}\n\nGenerate today's optimal workout plan in JSON.`;
    } else if (task === 'SUBSTITUTE_EXERCISE') {
      systemInstruction = `${baseGuardrails}
Job: Provide an instant 1-tap exercise substitution.
Maintain the same movement pattern and training goal, respecting the user's reason for replacement and equipment.
Schema:
{
  "originalExercise": "Original name",
  "replacementExercise": "Replacement name",
  "reason": "1 sentence explanation of why this replacement fits",
  "movementPattern": "e.g. Horizontal Push or Quad Dominant Squat",
  "targetWeightKg": 60,
  "targetReps": "8-10",
  "targetSets": 3
}`;
      promptText = `Athlete Context:\n${body.userContext || ''}\n\nRequest: Replace exercise "${body.substitution?.exerciseToReplace}" because "${body.substitution?.reasonOption}".\nGenerate replacement in JSON.`;
    } else if (task === 'WORKOUT_COMMAND') {
      systemInstruction = `${baseGuardrails}
Job: Modify the active workout based on a natural command (e.g. "Only have 30 mins", "Gym is crowded", "Low energy", "Should I increase weight?").
Act on the workout by adjusting volume/exercises or providing specific weight progression advice.
Schema:
{
  "actionType": "SHORTEN_TIME" | "SWAP_EQUIPMENT" | "DELOAD_INTENSITY" | "WEIGHT_ADVICE" | "CUSTOM",
  "summary": "Short 1-line headline of change",
  "coachAdvice": "1-2 sentences direct actionable coaching guidance",
  "modifiedExercises": [
    {
      "exercise": "Exercise name",
      "sets": 2,
      "reps": "8-10",
      "targetWeightKg": 60,
      "restSeconds": 90,
      "reason": "Adapted for time or equipment"
    }
  ]
}`;
      promptText = `Athlete Context:\n${body.userContext || ''}\n\nActive Workout:\n${JSON.stringify(body.command?.activeWorkout || {})}\n\nUser Command: "${body.command?.instruction}"\nGenerate structured response in JSON.`;
    } else if (task === 'POST_WORKOUT_TAKE') {
      systemInstruction = `${baseGuardrails}
Job: Provide an immediate post-workout analysis.
Keep it strictly under 3 sentences. No congratulations essay. Compare to previous session, highlight key lift performance, and define the exact target for the next session.
Schema:
{
  "headline": "e.g. +1 rep on Bench Press • Volume overload on track",
  "volumeVsLastWeek": "e.g. +4% total tonnage vs last week",
  "keyAchievements": ["Achievement 1", "Achievement 2"],
  "nextSessionTarget": "Specific weight and rep target for the next time this workout or lift is performed"
}`;
      promptText = `Athlete Context:\n${body.userContext || ''}\n\nCompleted Session:\n${JSON.stringify(body.completedWorkout || {})}\nGenerate post-workout take in JSON.`;
    } else if (task === 'WEEKLY_REVIEW') {
      systemInstruction = `${baseGuardrails}
Job: Generate a weekly review synthesizing training completion, key lift progress, and water/creatine habit consistency.
Schema:
{
  "weekSummary": "1-2 sentences summarizing the training week",
  "workoutsCompleted": 4,
  "plannedDaysPerWeek": 4,
  "strengthHighlight": "1 sentence on primary strength progression or plateau",
  "habitInsight": "1 sentence connecting water/creatine consistency to recovery",
  "focusNextWeek": "1-2 sentences detailing next week's progressive overload target"
}`;
      promptText = `Athlete Context & 7-Day History:\n${body.userContext || ''}\n\nWeekly Stats:\n${JSON.stringify(body.weeklyStats || {})}\nGenerate weekly review in JSON.`;
    } else {
      // COACH_INSIGHT (General Tactical Home Card)
      systemInstruction = `${baseGuardrails}
Job: Provide real-time tactical volume overload and recovery guidance for today.
Schema:
{
  "volumeTrend": "1-2 punchy sentences describing volume overload/fatigue trend with numbers",
  "recoveryStatus": "1-2 sharp sentences assessing CNS and muscular recovery based on workout frequency, rest days, and hydration/protein status",
  "tacticalAdvice": "2-3 specific, high-leverage tactical instructions for today's workout or recovery strategy (e.g. lift selection, RPE target, deload advice, hydration/creatine timing)",
  "fatigueWarning": "Optional 1 sentence warning if overtraining risk, high consecutive training days, or severe dehydration/protein deficit is detected. Otherwise null or empty string."
}`;
      promptText = `Athlete Data & Context:\n${body.userContext || ''}\n\nGenerate tactical coaching feedback in JSON.`;
    }

    let rawText = '';
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: promptText,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });

        if (response && response.text) {
          rawText = response.text;
          break;
        }
      } catch (err: any) {
        lastError = err;
        if (
          err?.status === 401 ||
          err?.status === 403 ||
          err?.message?.includes('API_KEY_INVALID') ||
          err?.message?.includes('API key not valid')
        ) {
          throw err;
        }
      }
    }

    if (!rawText) {
      throw lastError || new Error('Failed to generate response from Gemini API.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    }

    return NextResponse.json({
      success: true,
      task,
      source: 'gemini',
      data: parsed,
    });
  } catch (error: any) {
    console.error('Gemini Coach API Error:', error);
    return NextResponse.json(
      {
        error: 'GEMINI_ERROR',
        message: error?.message || 'Failed to process AI Coach request.',
      },
      { status: 500 }
    );
  }
}
