import { GoogleGenAI } from '@google/genai';
import {
  getServerGeminiApiKey,
  getServerGroqApiKey,
  getServerOpenRouterApiKey,
  redactSecrets,
} from './server-security';
import { checkGlobalRateLimit } from './rate-limit';

/**
 * Global daily AI circuit breaker (QA4-002 / RB-2).
 *
 * Per-IP route limits alone cannot stop distributed quota burn (many IPs,
 * each under its own limit). This breaker counts EVERY provider execution
 * against one fleet-wide key in the shared rate-limit store, over a 24h
 * window. When the cap trips, AI calls fail fast with a clear error until
 * the window resets — no provider is contacted, so no quota is spent.
 *
 * Default cap: 2,000 executions/day. Real usage is a small user base making
 * at most a few dozen AI calls per person per day, so 2,000 sits orders of
 * magnitude above legitimate traffic while still bounding worst-case daily
 * burn to a fraction of one day of abusive per-IP traffic. Tune with the
 * AI_DAILY_GLOBAL_CAP env var (set <= 0 to disable the breaker).
 */
export const DEFAULT_AI_DAILY_GLOBAL_CAP = 2000;

export class AiGlobalCapExceededError extends Error {
  constructor(cap: number) {
    super(
      `AI service daily limit reached (${cap} requests per 24h). AI features are paused until the daily window resets.`
    );
    this.name = 'AiGlobalCapExceededError';
  }
}

export function getAiDailyGlobalCap(): number {
  const raw = Number(process.env.AI_DAILY_GLOBAL_CAP);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (Number.isFinite(raw) && raw <= 0 && process.env.AI_DAILY_GLOBAL_CAP !== undefined) return 0;
  return DEFAULT_AI_DAILY_GLOBAL_CAP;
}

async function assertAiDailyBudget(): Promise<void> {
  const cap = getAiDailyGlobalCap();
  if (cap <= 0) return; // breaker explicitly disabled via env
  const result = await checkGlobalRateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    maxRequests: cap,
    keyPrefix: 'ai-global-daily',
    // If the limiter backend itself is down we do NOT fail closed here:
    // the AI routes already fail closed (503) on limiter outage before
    // reaching the provider layer, so a failure at this point can only
    // degrade to per-instance in-memory counting, never to unbounded use.
    failClosed: false,
  });
  if (!result.success) {
    throw new AiGlobalCapExceededError(cap);
  }
}

export interface VisionOptions {
  imageBase64: string;
  mimeType?: string;
  prompt: string;
  systemPrompt?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TextOptions {
  prompt: string;
  systemPrompt?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ProviderExecutionResult<T> {
  data: T;
  provider: 'gemini' | 'groq' | 'openrouter';
  model: string;
}

/**
 * Creates an AbortController combining a timeout with an optional caller AbortSignal.
 */
function createTimeoutController(timeoutMs: number, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let onAbort: (() => void) | null = null;
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      onAbort = () => controller.abort();
      parentSignal.addEventListener('abort', onAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timer);
    if (onAbort && parentSignal) {
      parentSignal.removeEventListener('abort', onAbort);
    }
  };

  return { signal: controller.signal, cleanup };
}

/**
 * Strips markdown code blocks and isolates valid JSON objects or arrays.
 */
export function cleanAndParseJson<T = any>(rawText: string): T {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response received from AI model');
  }

  let cleaned = rawText
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/\s*```$/m, '')
    .trim();

  // If there's conversational text before or after, extract the outer-most JSON object or array
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = cleaned.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = cleaned.lastIndexOf(']');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  return JSON.parse(cleaned) as T;
}

// Shared wall-clock execution limits
export const DEFAULT_AI_TIMEOUT_MS = 19000;
export const GROQ_STAGE_TIMEOUT_MS = 5000;
export const OPENROUTER_STAGE_TIMEOUT_MS = 6000;
export const GEMINI_STAGE_TIMEOUT_MS = 8000;

// Groq models: ultra-fast inference with dedicated LPU
// qwen/qwen3.8-27b verified live with multimodal image inputs in ~550ms.
// Text models (openai/gpt-oss-120b, openai/gpt-oss-20b) are strictly text-only and excluded from vision.
export const GROQ_VISION_MODELS = [
  'qwen/qwen3.8-27b',
];

export const GROQ_TEXT_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
];

// OpenRouter Vision Models:
// OpenRouter routes requests through third-party host aggregators whose data retention terms vary.
// Free-tier endpoints (:free) log prompts and imagery for host model training, making them unsuitable for meal photos.
// Production meal photos route directly to verified first-party developer endpoints (Groq LPU and Google Gemini API).
// OpenRouter is intentionally skipped for vision (empty array) to guarantee user photo privacy.
export const OPENROUTER_VISION_MODELS: string[] = [];

// OpenRouter verified models for text-only (natural language logging, coach)
// Empirically tested live with sub-3s response latencies under valid JSON completion
export const OPENROUTER_TEXT_MODELS = [
  'liquid/lfm-2.5-2.6b:free',
  'poolside/laguna-xs-2.1:free',
];

// Active production models supported by Google GenAI SDK (@google/genai)
// Both gemini-3.1-flash-lite and gemini-3.5-flash-lite have been empirically verified live
// with multimodal meal image inference (~1.9s - 2.3s latency) and separate active quotas.
// Note: gemini-3.5-flash was verified to route to gemini-3.6-flash which hit daily free quota (429),
// and gemini-2.5-flash is decommissioned for new users (404).
export const GEMINI_VISION_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];

export const GEMINI_TEXT_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];

/**
 * 1. Executes Gemini API calls using the Google Gen AI SDK.
 */
async function callGeminiVision<T>(
  apiKey: string,
  model: string,
  opts: VisionOptions,
  timeoutMs: number
): Promise<T> {
  const ai = new GoogleGenAI({ apiKey });
  const { signal, cleanup } = createTimeoutController(timeoutMs, opts.signal);

  try {
    const imagePart = {
      inlineData: {
        mimeType: opts.mimeType || 'image/jpeg',
        data: opts.imageBase64,
      },
    };

    const fullPrompt = opts.systemPrompt
      ? `${opts.systemPrompt}\n\n${opts.prompt}`
      : opts.prompt;

    const response = await ai.models.generateContent({
      model,
      contents: [imagePart, fullPrompt],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        abortSignal: signal,
      },
    });

    return cleanAndParseJson<T>(response.text || '');
  } finally {
    cleanup();
  }
}

/**
 * 2. Executes Groq Cloud API calls using OpenAI-compatible chat completions.
 */
async function callGroqVision<T>(
  apiKey: string,
  model: string,
  opts: VisionOptions,
  timeoutMs: number
): Promise<T> {
  const { signal, cleanup } = createTimeoutController(timeoutMs, opts.signal);

  try {
    const mime = opts.mimeType || 'image/jpeg';
    const messages: any[] = [];

    if (opts.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }

    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: `${opts.prompt}\n\nIMPORTANT: Return ONLY valid JSON.` },
        {
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${opts.imageBase64}` },
        },
      ],
    });

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq ${model} error (${res.status}): ${redactSecrets(errText)}`);
    }

    const json = await res.json();
    if (json.error) {
      const errMsg = json.error.message || JSON.stringify(json.error);
      throw new Error(`Groq ${model} error: ${redactSecrets(errMsg)}`);
    }
    const rawContent = json.choices?.[0]?.message?.content || '';
    return cleanAndParseJson<T>(rawContent);
  } finally {
    cleanup();
  }
}

/**
 * 3. Executes OpenRouter API calls using OpenAI-compatible chat completions.
 */
async function callOpenRouterVision<T>(
  apiKey: string,
  model: string,
  opts: VisionOptions,
  timeoutMs: number
): Promise<T> {
  if (model.endsWith(':free')) {
    throw new Error(
      `OpenRouter model ${model} uses free-tier third-party logging/training terms and is strictly prohibited for user meal photos`
    );
  }

  const { signal, cleanup } = createTimeoutController(timeoutMs, opts.signal);

  try {
    const mime = opts.mimeType || 'image/jpeg';
    const messages: any[] = [];

    if (opts.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }

    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: `${opts.prompt}\n\nIMPORTANT: Return ONLY valid JSON.` },
        {
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${opts.imageBase64}` },
        },
      ],
    });

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://ascendtonext.vercel.app',
        'X-Title': 'ASCEND Strength System',
        'X-Data-Collection': 'deny',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${model} error (${res.status}): ${redactSecrets(errText)}`);
    }

    const json = await res.json();
    if (json.error) {
      const errMsg = json.error.message || JSON.stringify(json.error);
      throw new Error(`OpenRouter ${model} error: ${redactSecrets(errMsg)}`);
    }
    const rawContent = json.choices?.[0]?.message?.content || '';
    return cleanAndParseJson<T>(rawContent);
  } finally {
    cleanup();
  }
}

/**
 * Unified Multi-Provider Vision Execution with Automatic Cascading Fallback:
 * Groq -> OpenRouter -> Gemini
 *
 * Enforces one strict shared wall-clock deadline (default 19s) across all stages and models,
 * with real-time AbortSignal propagation and user cancellation.
 */
export async function executeMultiProviderVision<T>(
  opts: VisionOptions
): Promise<ProviderExecutionResult<T>> {
  await assertAiDailyBudget();
  const errors: string[] = [];
  const overallTimeoutMs = opts.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS;
  const startTime = Date.now();
  const deadline = startTime + overallTimeoutMs;

  if (opts.signal?.aborted) {
    throw new Error('Vision request was aborted by client');
  }

  // Master controller enforcing the shared wall-clock deadline across ALL providers
  const masterController = new AbortController();
  const masterTimer = setTimeout(() => {
    masterController.abort(
      new Error(`AI vision request exceeded shared wall-clock deadline of ${overallTimeoutMs}ms`)
    );
  }, overallTimeoutMs);

  const parentSignal = opts.signal;
  let onParentAbort: (() => void) | null = null;
  if (parentSignal) {
    onParentAbort = () => {
      masterController.abort(parentSignal.reason || new Error('Vision request was aborted by client'));
    };
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  const getRemainingTime = () => Math.max(0, deadline - Date.now());
  const scopedOpts: VisionOptions = {
    ...opts,
    signal: masterController.signal,
  };

  try {
    // --- STAGE 1: GROQ CLOUD (Ultra-Fast LPU Inference ~500ms, max 5s timeout) ---
    const groqKey = getServerGroqApiKey();
    if (groqKey) {
      for (const model of GROQ_VISION_MODELS) {
        const remaining = getRemainingTime();
        if (remaining <= 50 || masterController.signal.aborted) break;
        const attemptTimeout = Math.min(GROQ_STAGE_TIMEOUT_MS, remaining);
        try {
          const data = await callGroqVision<T>(groqKey, model, scopedOpts, attemptTimeout);
          return { data, provider: 'groq', model };
        } catch (err: any) {
          if (masterController.signal.aborted && parentSignal?.aborted) throw err;
          const msg = redactSecrets(err?.message || String(err));
          errors.push(`Groq [${model}]: ${msg}`);
        }
      }
    } else {
      errors.push('Groq: GROQ_API_KEY not configured');
    }

    // --- STAGE 2: OPENROUTER (Skipped for vision by default to protect photo privacy) ---
    const openRouterKey = getServerOpenRouterApiKey();
    if (openRouterKey && OPENROUTER_VISION_MODELS.length > 0) {
      for (const model of OPENROUTER_VISION_MODELS) {
        const remaining = getRemainingTime();
        if (remaining <= 50 || masterController.signal.aborted) break;
        const attemptTimeout = Math.min(OPENROUTER_STAGE_TIMEOUT_MS, remaining);
        try {
          const data = await callOpenRouterVision<T>(openRouterKey, model, scopedOpts, attemptTimeout);
          return { data, provider: 'openrouter', model };
        } catch (err: any) {
          if (masterController.signal.aborted && parentSignal?.aborted) throw err;
          const msg = redactSecrets(err?.message || String(err));
          errors.push(`OpenRouter [${model}]: ${msg}`);
        }
      }
    }

    // --- STAGE 3: GOOGLE GEMINI (Enterprise developer endpoints, max 8s per model) ---
    const geminiKey = getServerGeminiApiKey();
    if (geminiKey) {
      for (const model of GEMINI_VISION_MODELS) {
        const remaining = getRemainingTime();
        if (remaining <= 50 || masterController.signal.aborted) break;
        const attemptTimeout = Math.min(GEMINI_STAGE_TIMEOUT_MS, remaining);
        try {
          const data = await callGeminiVision<T>(geminiKey, model, scopedOpts, attemptTimeout);
          return { data, provider: 'gemini', model };
        } catch (err: any) {
          if (masterController.signal.aborted && parentSignal?.aborted) throw err;
          const msg = redactSecrets(err?.message || String(err));
          errors.push(`Gemini [${model}]: ${msg}`);
        }
      }
    } else {
      errors.push('Gemini: GEMINI_API_KEY not configured');
    }

    const elapsed = Date.now() - startTime;
    if (masterController.signal.aborted && !parentSignal?.aborted) {
      throw new Error(
        `All vision AI providers timed out within the shared ${overallTimeoutMs}ms wall-clock deadline (${elapsed}ms elapsed):\n${errors.join('\n')}`
      );
    }

    throw new Error(`All vision AI providers failed (${elapsed}ms elapsed):\n${errors.join('\n')}`);
  } finally {
    clearTimeout(masterTimer);
    if (onParentAbort && parentSignal) {
      parentSignal.removeEventListener('abort', onParentAbort);
    }
  }
}

/**
 * 1. Executes Gemini API calls for text/JSON.
 */
async function callGeminiText<T>(
  apiKey: string,
  model: string,
  opts: TextOptions,
  timeoutMs: number
): Promise<T> {
  const ai = new GoogleGenAI({ apiKey });
  const { signal, cleanup } = createTimeoutController(timeoutMs, opts.signal);

  try {
    const fullPrompt = opts.systemPrompt
      ? `${opts.systemPrompt}\n\n${opts.prompt}`
      : opts.prompt;

    const response = await ai.models.generateContent({
      model,
      contents: [fullPrompt],
      config: {
        responseMimeType: 'application/json',
        abortSignal: signal,
      },
    });

    return cleanAndParseJson<T>(response.text || '');
  } finally {
    cleanup();
  }
}

/**
 * 2. Executes Groq API calls for text/JSON.
 */
async function callGroqText<T>(
  apiKey: string,
  model: string,
  opts: TextOptions,
  timeoutMs: number
): Promise<T> {
  const { signal, cleanup } = createTimeoutController(timeoutMs, opts.signal);

  try {
    const messages: any[] = [];
    if (opts.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }
    messages.push({
      role: 'user',
      content: `${opts.prompt}\n\nIMPORTANT: Return ONLY valid JSON matching schema.`,
    });

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq ${model} error (${res.status}): ${redactSecrets(errText)}`);
    }

    const json = await res.json();
    if (json.error) {
      const errMsg = json.error.message || JSON.stringify(json.error);
      throw new Error(`Groq ${model} error: ${redactSecrets(errMsg)}`);
    }
    const rawContent = json.choices?.[0]?.message?.content || '';
    return cleanAndParseJson<T>(rawContent);
  } finally {
    cleanup();
  }
}

/**
 * 3. Executes OpenRouter API calls for text/JSON.
 */
async function callOpenRouterText<T>(
  apiKey: string,
  model: string,
  opts: TextOptions,
  timeoutMs: number
): Promise<T> {
  const { signal, cleanup } = createTimeoutController(timeoutMs, opts.signal);

  try {
    const messages: any[] = [];
    if (opts.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }
    messages.push({
      role: 'user',
      content: `${opts.prompt}\n\nIMPORTANT: Return ONLY valid JSON matching schema.`,
    });

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://ascendtonext.vercel.app',
        'X-Title': 'ASCEND Strength System',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${model} error (${res.status}): ${redactSecrets(errText)}`);
    }

    const json = await res.json();
    if (json.error) {
      const errMsg = json.error.message || JSON.stringify(json.error);
      throw new Error(`OpenRouter ${model} error: ${redactSecrets(errMsg)}`);
    }
    const rawContent = json.choices?.[0]?.message?.content || '';
    return cleanAndParseJson<T>(rawContent);
  } finally {
    cleanup();
  }
}

/**
 * Unified Multi-Provider Text Execution with Automatic Cascading Fallback:
 * Groq -> OpenRouter -> Gemini
 *
 * Enforces one strict shared wall-clock deadline (default 19s) across all stages and models,
 * with real-time AbortSignal propagation and user cancellation.
 */
export async function executeMultiProviderText<T>(
  opts: TextOptions
): Promise<ProviderExecutionResult<T>> {
  await assertAiDailyBudget();
  const errors: string[] = [];
  const overallTimeoutMs = opts.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS;
  const startTime = Date.now();
  const deadline = startTime + overallTimeoutMs;

  if (opts.signal?.aborted) {
    throw new Error('Text request was aborted by client');
  }

  // Master controller enforcing the shared wall-clock deadline across ALL providers
  const masterController = new AbortController();
  const masterTimer = setTimeout(() => {
    masterController.abort(
      new Error(`AI text request exceeded shared wall-clock deadline of ${overallTimeoutMs}ms`)
    );
  }, overallTimeoutMs);

  const parentSignal = opts.signal;
  let onParentAbort: (() => void) | null = null;
  if (parentSignal) {
    onParentAbort = () => {
      masterController.abort(parentSignal.reason || new Error('Text request was aborted by client'));
    };
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  const getRemainingTime = () => Math.max(0, deadline - Date.now());
  const scopedOpts: TextOptions = {
    ...opts,
    signal: masterController.signal,
  };

  try {
    // --- STAGE 1: GROQ CLOUD (Ultra-Fast LPU Text ~300ms, max 5s timeout) ---
    const groqKey = getServerGroqApiKey();
    if (groqKey) {
      for (const model of GROQ_TEXT_MODELS) {
        const remaining = getRemainingTime();
        if (remaining <= 50 || masterController.signal.aborted) break;
        const attemptTimeout = Math.min(GROQ_STAGE_TIMEOUT_MS, remaining);
        try {
          const data = await callGroqText<T>(groqKey, model, scopedOpts, attemptTimeout);
          return { data, provider: 'groq', model };
        } catch (err: any) {
          if (masterController.signal.aborted && parentSignal?.aborted) throw err;
          const msg = redactSecrets(err?.message || String(err));
          errors.push(`Groq [${model}]: ${msg}`);
        }
      }
    } else {
      errors.push('Groq: GROQ_API_KEY not configured');
    }

    // --- STAGE 2: OPENROUTER (Bounded 6s fallback) ---
    const openRouterKey = getServerOpenRouterApiKey();
    if (openRouterKey) {
      for (const model of OPENROUTER_TEXT_MODELS) {
        const remaining = getRemainingTime();
        if (remaining <= 50 || masterController.signal.aborted) break;
        const attemptTimeout = Math.min(OPENROUTER_STAGE_TIMEOUT_MS, remaining);
        try {
          const data = await callOpenRouterText<T>(openRouterKey, model, scopedOpts, attemptTimeout);
          return { data, provider: 'openrouter', model };
        } catch (err: any) {
          if (masterController.signal.aborted && parentSignal?.aborted) throw err;
          const msg = redactSecrets(err?.message || String(err));
          errors.push(`OpenRouter [${model}]: ${msg}`);
        }
      }
    } else {
      errors.push('OpenRouter: OPENROUTER_API_KEY not configured');
    }

    // --- STAGE 3: GOOGLE GEMINI (Final Distinct Fallback, max 8s per model) ---
    const geminiKey = getServerGeminiApiKey();
    if (geminiKey) {
      for (const model of GEMINI_TEXT_MODELS) {
        const remaining = getRemainingTime();
        if (remaining <= 50 || masterController.signal.aborted) break;
        const attemptTimeout = Math.min(GEMINI_STAGE_TIMEOUT_MS, remaining);
        try {
          const data = await callGeminiText<T>(geminiKey, model, scopedOpts, attemptTimeout);
          return { data, provider: 'gemini', model };
        } catch (err: any) {
          if (masterController.signal.aborted && parentSignal?.aborted) throw err;
          const msg = redactSecrets(err?.message || String(err));
          errors.push(`Gemini [${model}]: ${msg}`);
        }
      }
    } else {
      errors.push('Gemini: GEMINI_API_KEY not configured');
    }

    const elapsed = Date.now() - startTime;
    if (masterController.signal.aborted && !parentSignal?.aborted) {
      throw new Error(
        `All text AI providers timed out within the shared ${overallTimeoutMs}ms wall-clock deadline (${elapsed}ms elapsed):\n${errors.join('\n')}`
      );
    }

    throw new Error(`All text AI providers failed (${elapsed}ms elapsed):\n${errors.join('\n')}`);
  } finally {
    clearTimeout(masterTimer);
    if (onParentAbort && parentSignal) {
      parentSignal.removeEventListener('abort', onParentAbort);
    }
  }
}
