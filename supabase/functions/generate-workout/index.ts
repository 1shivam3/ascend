// Supabase Edge Function: generate-workout
// Follows strict server-side validation, rate limiting, secure Gemini API calls, and zero PII logging.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiter cache: IP/UserID -> [timestamps]
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(identifier: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(identifier) || [];
  const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(identifier, validTimestamps);
    return true;
  }

  validTimestamps.push(now);
  rateLimitMap.set(identifier, validTimestamps);
  return false;
}

// Request validation schema
const RequestSchema = z.object({
  goal: z.string().default('STRENGTH'),
  primary_goal: z.string().optional(),
  secondary_goals: z.array(z.string()).default([]),
  custom_goal_description: z.string().optional(),
  sport_name: z.string().optional(),
  age: z.number().min(12).max(100).default(25),
  height: z.number().min(80).max(250).default(175),
  weight: z.number().min(30).max(300).default(75),
  experience: z.string().default('INTERMEDIATE'),
  days_per_week: z.number().int().min(1).max(7).default(4),
  session_duration: z.number().int().min(15).max(180).default(60),
  equipment: z.array(z.string()).default(['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT']),
  training_location: z.string().default('COMMERCIAL_GYM'),
  preferred_exercises: z.array(z.string()).default([]),
  excluded_exercises: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});

// Output plan schema
const AIExerciseSchema = z.object({
  exercise_id: z.string(),
  name: z.string(),
  order: z.number(),
  sets: z.number().int().min(1).max(10),
  target_reps: z.union([z.number(), z.string()]),
  target_rpe: z.number().nullable().optional(),
  rest_seconds: z.number().default(90),
  instructions: z.string().nullable().optional(),
  alternatives: z.array(z.string()).default([]),
});

const AIDaySchema = z.object({
  day_number: z.number().int().min(1).max(7),
  name: z.string(),
  focus: z.string(),
  estimated_duration_min: z.number(),
  exercises: z.array(AIExerciseSchema).min(1),
});

const AIPlanResponseSchema = z.object({
  id: z.string().default(() => `plan-${Date.now()}`),
  name: z.string(),
  split_type: z.string(),
  days_per_week: z.number(),
  difficulty: z.string(),
  weekly_structure: z.string(),
  progression_suggestions: z.string(),
  days: z.array(AIDaySchema).min(1),
});

serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clientIp = req.headers.get('x-forwarded-for') || 'anon-client';

  // 2. Rate Limiting Check
  if (isRateLimited(clientIp)) {
    console.warn(`[EdgeFunction] Rate limit exceeded for IP: ${clientIp.slice(0, 8)}***`);
    return new Response(
      JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many workout generation requests. Please try again later.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const rawBody = await req.json();
    const parseResult = RequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: 'INVALID_REQUEST', details: parseResult.error.format() }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const input = parseResult.data;
    let apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        if (supabaseUrl && serviceRoleKey) {
          const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
          const { data, error } = await supabaseAdmin.rpc('get_secret', { secret_name: 'GEMINI_API_KEY' });
          if (!error && typeof data === 'string' && data.length > 0) {
            apiKey = data;
          }
        }
      } catch (vaultErr) {
        console.warn('[EdgeFunction] Failed to query secret from vault:', vaultErr);
      }
    }

    if (!apiKey) {
      console.error('[EdgeFunction] Missing GEMINI_API_KEY in environment or vault');
      return new Response(
        JSON.stringify({ error: 'SERVER_CONFIG_ERROR', message: 'AI provider not configured.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Build Safe Gemini Prompt
    const systemInstruction = `You are the lead tactical exercise science architect for ASCEND, an elite fitness-RPG application.
Your mission is to generate a comprehensive, periodized, high-yield weekly training plan strictly tailored to the user's specific athletic goal and discipline.
DO NOT make ASCEND bodybuilding-centric. Align the program directly to the specified training discipline:
- Strength (GET_STRONGER / BUILD_STRENGTH): Heavy compounds (squats, bench, deadlifts, presses), 3-6 rep ranges, 3-5 sets, 150-180s rest, linear strength progression.
- Hypertrophy (BUILD_MUSCLE / HYPERTROPHY): Moderate 8-12 reps, volume, muscle-group balance, 75-90s rest.
- Athletic (ATHLETIC_PERFORMANCE / ATHLETICISM): Power, speed, jumps, carries, movement quality, explosive concentric reps, 90-120s rest.
- Endurance (ENDURANCE): Duration, distance, pace, aerobic capacity, high rep ranges (15-25) or cardio sessions, 30-60s rest.
- Calisthenics (CALISTHENICS): Bodyweight skills, pull-ups, dips, push-ups, levers, core capacity, 60-90s rest.
- Fat Loss (LOSE_FAT / FAT_LOSS): High-density circuits, compound movements, 12-15 reps, 45-60s rest.
- Sport Performance (SPORT_PERFORMANCE): Multi-planar power, deceleration, unilateral strength, agility.
- General Fitness (GENERAL_FITNESS): Balanced compound strength, mobility, and cardio.

RULES:
1. Return strictly a JSON object conforming to this schema:
{
  "id": "plan-timestamp",
  "name": "Program Title",
  "split_type": "Split name (e.g. UPPER_LOWER, PUSH_PULL_LEGS, FULL_BODY, ATHLETIC_SPLIT, CALISTHENICS_CIRCUIT, ENDURANCE_ENGINE)",
  "days_per_week": number,
  "difficulty": "BEGINNER | INTERMEDIATE | ADVANCED",
  "weekly_structure": "Brief description of the training week",
  "progression_suggestions": "Specific progressive overload guidelines",
  "days": [
    {
      "day_number": 1,
      "name": "Day Title",
      "focus": "Target muscle groups or focus",
      "estimated_duration_min": number,
      "exercises": [
        {
          "exercise_id": "slug-id",
          "name": "Exercise Name",
          "order": 0,
          "sets": number (2-5),
          "target_reps": "6-8" or number,
          "target_rpe": 8,
          "rest_seconds": 90,
          "instructions": "Tactical cue",
          "alternatives": ["Alternative 1", "Alternative 2"]
        }
      ]
    }
  ]
}
2. ONLY select movements compatible with the specified available equipment: ${JSON.stringify(input.equipment)}.
3. NEVER prescribe any excluded exercise: ${JSON.stringify(input.excluded_exercises)}.
4. Respect all physical limitations: ${JSON.stringify(input.limitations)}.
5. Prioritize preferred exercises where anatomically appropriate: ${JSON.stringify(input.preferred_exercises)}.
6. Output raw JSON only. No explanations, no markdown formatting.`;

    const userPrompt = `Generate a ${input.days_per_week}-day workout program.
Primary Goal: ${input.primary_goal || input.goal}
Secondary Goals: ${(input.secondary_goals || []).join(', ') || 'None'}
${input.sport_name ? `Target Sport: ${input.sport_name}` : ''}
${input.custom_goal_description ? `Custom Goal Directives: ${input.custom_goal_description}` : ''}
Experience: ${input.experience}
Session Duration: ~${input.session_duration} minutes
Location: ${input.training_location}
Equipment: ${input.equipment.join(', ')}`;

    // 4. Call Gemini API with structured JSON output
    const modelsToTry = ['gemini-3.6-flash', 'gemini-3.5-flash'];
    let geminiResponse: Response | null = null;
    let lastErrorText = '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };

    const requestBody = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.2,
      },
    });

    for (const modelName of modelsToTry) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const resp = await fetch(geminiUrl, {
            method: 'POST',
            headers,
            body: requestBody,
          });
          if (resp.ok) {
            geminiResponse = resp;
            break;
          } else {
            lastErrorText = await resp.text();
            console.warn(`[EdgeFunction] Model ${modelName} attempt ${attempt} returned ${resp.status}: ${lastErrorText.slice(0, 150)}`);
            if (resp.status === 503 || resp.status === 429) {
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }
            break;
          }
        } catch (fetchErr) {
          lastErrorText = (fetchErr as Error).message;
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (geminiResponse) break;
    }

    if (!geminiResponse) {
      console.error(`[EdgeFunction] All Gemini model attempts failed. Last response: ${lastErrorText.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ error: 'AI_PROVIDER_ERROR', details: lastErrorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiResponse.json();
    const candidateText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      console.error('[EdgeFunction] Empty or missing candidate in Gemini response');
      return new Response(
        JSON.stringify({ error: 'EMPTY_AI_RESPONSE' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Parse and Validate JSON
    let parsedPlanJson: unknown;
    try {
      parsedPlanJson = JSON.parse(candidateText);
    } catch {
      console.error('[EdgeFunction] Model output failed JSON.parse');
      return new Response(
        JSON.stringify({ error: 'MALFORMED_JSON_OUTPUT' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const planValidation = AIPlanResponseSchema.safeParse(parsedPlanJson);
    if (!planValidation.success) {
      console.error('[EdgeFunction] Output failed AIPlanResponseSchema validation:', planValidation.error.format());
      return new Response(
        JSON.stringify({ error: 'SCHEMA_VALIDATION_FAILED', issues: planValidation.error.issues }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Success: Return strictly validated structured plan
    return new Response(
      JSON.stringify(planValidation.data),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[EdgeFunction] Unhandled exception:', (err as Error).message);
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: 'Internal server error processing workout generation.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
