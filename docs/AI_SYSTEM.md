# ASCEND — AI Architecture & Integration Specification

## 1. System Role & Ethical Boundary

In ASCEND, the AI engine is designated as the **Tactical Routine Architect & Performance Analyst**. 

### 1.1 Strict Architectural Separation
* **What AI Does:**
  * Synthesizes personalized workout splits based on equipment, split preference, target muscles, and injury constraints.
  * Autoregulates in-session targets (e.g., suggesting weight/rep adjustments based on prior set RPE).
  * Provides biomechanical form cues and warm-up recommendations.
  * Detects systemic fatigue trends across rolling 4-week periods.
* **What AI NEVER Does:**
  * Never calculates, awards, or adjusts XP.
  * Never sets character levels, lift levels, or ranks.
  * Never validates or overrides Personal Records (PRs).
  * Never determines quest completion or unlocks achievements.

All progression math is **100% deterministic code**.

---

## 2. Secure Backend Gateway Architecture

The client mobile application **never holds a Gemini API key**. All AI interactions flow through authenticated **Supabase Edge Functions**:

```
┌────────────────────────────────────────────────────────┐
│                   ASCEND MOBILE CLIENT                 │
│  User prompts or session triggers (e.g. "Draft PPL")   │
└──────────────────────────┬─────────────────────────────┘
                           │ Authenticated HTTPS (JWT in Authorization Header)
                           ▼
┌────────────────────────────────────────────────────────┐
│               SUPABASE EDGE FUNCTION GATEWAY           │
│  1. Authenticates user JWT via GoTrue                  │
│  2. Checks rate limits (e.g. max 10 generations/day)   │
│  3. Hydrates user context: available equipment,        │
│     mastery levels, recent volume, injuries            │
│  4. Fetches GEMINI_API_KEY from Supabase Vault         │
└──────────────────────────┬─────────────────────────────┘
                           │ Secure HTTPS
                           ▼
┌────────────────────────────────────────────────────────┐
│                 GOOGLE GEMINI 1.5 FLASH                │
│  Strict Structured Output Mode (response_schema)       │
└──────────────────────────┬─────────────────────────────┘
                           │ Validated JSON Schema
                           ▼
┌────────────────────────────────────────────────────────┐
│               EDGE FUNCTION POST-PROCESSING            │
│  1. Validates generated exercises against catalog slugs│
│  2. Strips unmapped exercises or substitutes matches   │
│  3. Formats into ASCEND WorkoutPlan JSON contract      │
└──────────────────────────┬─────────────────────────────┘
                           │ Return JSON Response
                           ▼
┌────────────────────────────────────────────────────────┐
│                   ASCEND MOBILE CLIENT                 │
│  Previews routine in UI; saves locally to SQLite       │
└────────────────────────────────────────────────────────┘
```

---

## 3. Edge Function Specifications

### 3.1 `generate-workout`
* **Model:** `gemini-1.5-flash` (Optimized for speed and sub-2s response latency).
* **Payload Request:**
```typescript
export interface GenerateWorkoutRequest {
  target_split: 'PPL' | 'UPPER_LOWER' | 'FULL_BODY' | 'TARGETED';
  duration_minutes: number;
  available_equipment: ('barbell' | 'dumbbell' | 'cables' | 'machine' | 'bodyweight')[];
  focus_muscles: string[];
  injury_constraints?: string[];
  experience_level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
}
```

* **Structured Output Schema (`response_schema`):**
```json
{
  "type": "object",
  "properties": {
    "routine_title": { "type": "string" },
    "estimated_duration_min": { "type": "integer" },
    "warmup_protocol": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "movement": { "type": "string" },
          "reps_or_seconds": { "type": "string" }
        },
        "required": ["movement", "reps_or_seconds"]
      }
    },
    "exercises": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "catalog_slug": { "type": "string" },
          "order": { "type": "integer" },
          "sets": { "type": "integer" },
          "target_rep_range": { "type": "string" },
          "target_rpe": { "type": "number" },
          "rest_seconds": { "type": "integer" },
          "coaching_cue": { "type": "string" }
        },
        "required": ["catalog_slug", "order", "sets", "target_rep_range", "target_rpe", "rest_seconds"]
      }
    }
  },
  "required": ["routine_title", "exercises"]
}
```

---

## 4. Prompt Engineering & Domain Context Hydration

To ensure the AI produces safe, effective, sports-science backed routines rather than hallucinated or reckless plans, the Edge Function injects a strict system prompt:

```markdown
You are the Tactical Routine Architect for ASCEND, an elite sports science workout system.
Your mission is to formulate biomechanically sound, progressive training sessions.

RULES:
1. Exercise Selection: Select ONLY movements that match the available equipment list.
2. Order of Execution:
   - Primary heavy compounds first (Squat, Hinge, Bench, Overhead Press).
   - Secondary compound / unilateral accessories second.
   - High-rep isolations / pump accessories last.
3. Fatigue Management:
   - Total working sets must be bounded between 12 and 22 sets for the entire workout.
   - Working RPE must be realistic (Compound: RPE 7-8.5; Accessories: RPE 8-9.5).
4. Injury Respect:
   - If user reports lumbar strain: Avoid axial loading (replace Barbell Squats with Belt Squats or Bulgarian Split Squats).
   - If user reports shoulder impingement: Replace standard bench press with neutral-grip dumbbell press.
5. Strict JSON:
   - Output ONLY the structured JSON format matching the schema. No markdown greetings or conversational filler.
```

---

## 5. Offline Fallback & Graceful Degradation

If the user requests a new workout while offline, or if the Gemini Edge Function encounters rate-limits or timeouts:

1. **Procedural Rule-Based Fallback Generator:**
   * A local deterministic routine generator within `src/services/ai/FallbackGenerator.ts` constructs a standard workout based on pre-compiled templates stored in SQLite:
     * *Push A:* Barbell Bench Press, Incline DB Press, Overhead Press, Lateral Raises, Tricep Rope Pushdowns.
     * *Pull A:* Barbell Deadlift, Barbell Bent-Over Row, Lat Pulldown, Face Pulls, Incline DB Bicep Curls.
     * *Legs A:* Barbell Back Squat, Romanian Deadlift, Leg Press, Standing Calf Raise.
2. **Seamless UI Transition:**
   * The UI displays a subtle indicator: *"Generated via Offline Tactical Core"*, allowing the lifter to start training with zero delay.
