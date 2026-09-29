import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

interface CoachRequestBody {
  customApiKey?: string;
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
}

export async function POST(req: Request) {
  try {
    const headerKey = req.headers.get('x-gemini-api-key');
    const body: CoachRequestBody = await req.json();

    const apiKey =
      (headerKey && headerKey.trim()) ||
      (body.customApiKey && body.customApiKey.trim()) ||
      process.env.GEMINI_API_KEY;

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

    const systemInstruction = `You are ASCEND AI Coach — an elite, battle-tested strength & conditioning coach and sports science expert.
Your persona is concise, sharp, motivating, and strictly grounded in real exercise physiology and progressive overload.
Tone: Direct, analytical, no fluff, no generic motivational filler. Focus on actionable tactical coaching.
Always respond with valid JSON matching this schema:
{
  "volumeTrend": "1-2 punchy sentences describing volume overload/fatigue trend with numbers",
  "recoveryStatus": "1-2 sharp sentences assessing CNS and muscular recovery based on workout frequency, rest days, and hydration/protein status",
  "tacticalAdvice": "2-3 specific, high-leverage tactical instructions for today's workout or recovery strategy (e.g. lift selection, RPE target, deload advice, hydration/creatine timing)",
  "fatigueWarning": "Optional 1 sentence warning if overtraining risk, high consecutive training days, or severe dehydration/protein deficit is detected. Otherwise null or empty string."
}`;

    const athleteContext = {
      athlete: {
        name: body.profile?.name || 'Athlete',
        gender: body.profile?.gender || 'male',
        bodyweight: `${body.profile?.bodyweightKg || 75} kg`,
        preferredUnit: body.profile?.unit || 'kg',
      },
      currentTonnageMetrics: {
        thisWeekKg: body.metrics?.volumeThisWeekKg ?? 0,
        lastWeekKg: body.metrics?.volumeLastWeekKg ?? 0,
        tonnageShiftPercent: `${body.metrics?.volumeDiffPercent ?? 0}%`,
        consecutiveTrainingDays: body.metrics?.consecutiveWorkoutDays ?? 0,
        daysSinceLastWorkout: body.metrics?.daysSinceLastWorkout ?? 0,
      },
      dailyEssentialsToday: {
        water: `${body.metrics?.waterMlToday ?? 0} ml logged / ${body.metrics?.waterTargetMl ?? 2700} ml target`,
        creatine: body.metrics?.creatineTakenToday
          ? `Taken today (${body.metrics?.creatineStreakDays || 1} day streak)`
          : 'Not yet taken today',
        protein: `${body.metrics?.proteinGToday ?? 0} g logged / ${body.metrics?.proteinTargetG ?? 140} g target`,
      },
      recentWorkouts: (body.recentWorkouts || []).slice(0, 5).map((w) => ({
        date: w.date,
        exercises: w.exercises.map((e) => ({
          name: e.name,
          setsSummary: `${e.sets.length} sets (top: ${Math.max(
            ...e.sets.map((s) => s.weight),
            0
          )}${e.sets[0]?.unit || 'kg'} x ${
            e.sets.reduce((maxR, s) => Math.max(maxR, s.reps), 0)
          })`,
        })),
      })),
      topPRs: body.topPRs || [],
    };

    const promptText = `Analyze this athlete's recent training volume, recovery metrics, and daily essentials. Provide elite coaching feedback in strict JSON format.\n\nAthlete Data:\n${JSON.stringify(
      athleteContext,
      null,
      2
    )}`;

    // Fallback model list in order of preference
    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash',
    ];

    let lastError: any = null;
    let rawText = '';

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
        // If error suggests invalid key, don't keep trying models
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

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Clean up markdown block if present
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    }

    return NextResponse.json({
      success: true,
      insight: {
        volumeTrend: parsed.volumeTrend || 'Volume overload data tracked.',
        recoveryStatus:
          parsed.recoveryStatus || 'Recovery indicators within expected parameters.',
        tacticalAdvice:
          parsed.tacticalAdvice ||
          'Focus on progressive overload and execute planned working sets with strict form.',
        fatigueWarning: parsed.fatigueWarning || undefined,
        source: 'gemini',
      },
    });
  } catch (error: any) {
    console.error('Gemini Coach API Error:', error);
    return NextResponse.json(
      {
        error: 'GEMINI_ERROR',
        message: error?.message || 'Failed to generate AI Coach insight.',
      },
      { status: 500 }
    );
  }
}
