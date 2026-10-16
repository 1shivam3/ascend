import { GoogleGenAI } from '@google/genai';
import {
  getServerGeminiApiKey,
  getServerGroqApiKey,
  getServerOpenRouterApiKey,
  redactSecrets,
} from './server-security';

export interface VisionOptions {
  imageBase64: string;
  mimeType?: string;
  prompt: string;
  systemPrompt?: string;
  timeoutMs?: number;
}

export interface TextOptions {
  prompt: string;
  systemPrompt?: string;
  timeoutMs?: number;
}

export interface ProviderExecutionResult<T> {
  data: T;
  provider: 'gemini' | 'groq' | 'openrouter';
  model: string;
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

// Stable production models with 1,500 RPD / 15 RPM free tier quotas
const GEMINI_VISION_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.5-flash',
  'gemini-flash-latest',
];

const GEMINI_TEXT_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.5-flash',
  'gemini-flash-latest',
];

const GROQ_VISION_MODELS = [
  'llama-3.2-11b-vision-preview',
  'llama-3.2-90b-vision-preview',
];

const GROQ_TEXT_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

const OPENROUTER_VISION_MODELS = [
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'qwen/qwen-2-vl-72b-instruct:free',
];

const OPENROUTER_TEXT_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
        abortSignal: controller.signal,
      },
    });

    return cleanAndParseJson<T>(response.text || '');
  } finally {
    clearTimeout(timer);
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq ${model} error (${res.status}): ${redactSecrets(errText)}`);
    }

    const json = await res.json();
    const rawContent = json.choices?.[0]?.message?.content || '';
    return cleanAndParseJson<T>(rawContent);
  } finally {
    clearTimeout(timer);
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${model} error (${res.status}): ${redactSecrets(errText)}`);
    }

    const json = await res.json();
    const rawContent = json.choices?.[0]?.message?.content || '';
    return cleanAndParseJson<T>(rawContent);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Unified Multi-Provider Vision Execution with Automatic Cascading Fallback:
 * Gemini -> Groq -> OpenRouter
 */
export async function executeMultiProviderVision<T>(
  opts: VisionOptions
): Promise<ProviderExecutionResult<T>> {
  const timeoutMs = opts.timeoutMs || 15000;
  const errors: string[] = [];

  // --- STAGE 1: GOOGLE GEMINI ---
  const geminiKey = getServerGeminiApiKey();
  if (geminiKey) {
    for (const model of GEMINI_VISION_MODELS) {
      try {
        const data = await callGeminiVision<T>(geminiKey, model, opts, timeoutMs);
        return { data, provider: 'gemini', model };
      } catch (err: any) {
        const msg = redactSecrets(err?.message || String(err));
        errors.push(`Gemini [${model}]: ${msg}`);
        // If 429 quota exhausted or 503 unavailable, try next model or next provider
      }
    }
  } else {
    errors.push('Gemini: GEMINI_API_KEY not configured');
  }

  // --- STAGE 2: GROQ CLOUD ---
  const groqKey = getServerGroqApiKey();
  if (groqKey) {
    for (const model of GROQ_VISION_MODELS) {
      try {
        const data = await callGroqVision<T>(groqKey, model, opts, timeoutMs);
        return { data, provider: 'groq', model };
      } catch (err: any) {
        const msg = redactSecrets(err?.message || String(err));
        errors.push(`Groq [${model}]: ${msg}`);
      }
    }
  } else {
    errors.push('Groq: GROQ_API_KEY not configured');
  }

  // --- STAGE 3: OPENROUTER ---
  const openRouterKey = getServerOpenRouterApiKey();
  if (openRouterKey) {
    for (const model of OPENROUTER_VISION_MODELS) {
      try {
        const data = await callOpenRouterVision<T>(openRouterKey, model, opts, timeoutMs);
        return { data, provider: 'openrouter', model };
      } catch (err: any) {
        const msg = redactSecrets(err?.message || String(err));
        errors.push(`OpenRouter [${model}]: ${msg}`);
      }
    }
  } else {
    errors.push('OpenRouter: OPENROUTER_API_KEY not configured');
  }

  throw new Error(`All vision AI providers failed:\n${errors.join('\n')}`);
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fullPrompt = opts.systemPrompt
      ? `${opts.systemPrompt}\n\n${opts.prompt}`
      : opts.prompt;

    const response = await ai.models.generateContent({
      model,
      contents: [fullPrompt],
      config: {
        responseMimeType: 'application/json',
        abortSignal: controller.signal,
      },
    });

    return cleanAndParseJson<T>(response.text || '');
  } finally {
    clearTimeout(timer);
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq ${model} error (${res.status}): ${redactSecrets(errText)}`);
    }

    const json = await res.json();
    const rawContent = json.choices?.[0]?.message?.content || '';
    return cleanAndParseJson<T>(rawContent);
  } finally {
    clearTimeout(timer);
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${model} error (${res.status}): ${redactSecrets(errText)}`);
    }

    const json = await res.json();
    const rawContent = json.choices?.[0]?.message?.content || '';
    return cleanAndParseJson<T>(rawContent);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Unified Multi-Provider Text Execution with Automatic Cascading Fallback:
 * Gemini -> Groq -> OpenRouter
 */
export async function executeMultiProviderText<T>(
  opts: TextOptions
): Promise<ProviderExecutionResult<T>> {
  const timeoutMs = opts.timeoutMs || 15000;
  const errors: string[] = [];

  // --- STAGE 1: GOOGLE GEMINI ---
  const geminiKey = getServerGeminiApiKey();
  if (geminiKey) {
    for (const model of GEMINI_TEXT_MODELS) {
      try {
        const data = await callGeminiText<T>(geminiKey, model, opts, timeoutMs);
        return { data, provider: 'gemini', model };
      } catch (err: any) {
        const msg = redactSecrets(err?.message || String(err));
        errors.push(`Gemini [${model}]: ${msg}`);
      }
    }
  } else {
    errors.push('Gemini: GEMINI_API_KEY not configured');
  }

  // --- STAGE 2: GROQ CLOUD ---
  const groqKey = getServerGroqApiKey();
  if (groqKey) {
    for (const model of GROQ_TEXT_MODELS) {
      try {
        const data = await callGroqText<T>(groqKey, model, opts, timeoutMs);
        return { data, provider: 'groq', model };
      } catch (err: any) {
        const msg = redactSecrets(err?.message || String(err));
        errors.push(`Groq [${model}]: ${msg}`);
      }
    }
  } else {
    errors.push('Groq: GROQ_API_KEY not configured');
  }

  // --- STAGE 3: OPENROUTER ---
  const openRouterKey = getServerOpenRouterApiKey();
  if (openRouterKey) {
    for (const model of OPENROUTER_TEXT_MODELS) {
      try {
        const data = await callOpenRouterText<T>(openRouterKey, model, opts, timeoutMs);
        return { data, provider: 'openrouter', model };
      } catch (err: any) {
        const msg = redactSecrets(err?.message || String(err));
        errors.push(`OpenRouter [${model}]: ${msg}`);
      }
    }
  } else {
    errors.push('OpenRouter: OPENROUTER_API_KEY not configured');
  }

  throw new Error(`All text AI providers failed:\n${errors.join('\n')}`);
}
