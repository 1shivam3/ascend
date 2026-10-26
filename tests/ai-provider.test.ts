import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cleanAndParseJson,
  executeMultiProviderVision,
  executeMultiProviderText,
  OPENROUTER_VISION_MODELS,
} from '@/lib/ai-provider';

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: (...args: any[]) => mockGenerateContent(...args),
    };
  },
}));

describe('AI Multi-Provider Engine', () => {
  describe('cleanAndParseJson', () => {
    it('parses raw JSON correctly', () => {
      const input = '{"mealName":"Chicken Bowl","totalCalories":450}';
      const result = cleanAndParseJson(input);
      expect(result).toEqual({ mealName: 'Chicken Bowl', totalCalories: 450 });
    });

    it('strips markdown ```json fences and trims whitespace', () => {
      const input = '```json\n{"mealName":"Paneer Curry","totalCalories":320}\n```';
      const result = cleanAndParseJson(input);
      expect(result.mealName).toBe('Paneer Curry');
      expect(result.totalCalories).toBe(320);
    });

    it('extracts embedded JSON when surrounded by conversational filler', () => {
      const input = 'Sure! Here is the nutritional analysis you requested:\n{"items":[{"name":"Roti","calories":120}],"totalCalories":120}\nHope this helps your workout!';
      const result = cleanAndParseJson(input);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Roti');
      expect(result.totalCalories).toBe(120);
    });

    it('throws when text contains no valid JSON object or array', () => {
      expect(() => cleanAndParseJson('I could not analyze this image.')).toThrow();
    });

    it('throws when input is empty or null', () => {
      expect(() => cleanAndParseJson('')).toThrow();
    });
  });

  describe('executeMultiProviderVision cascading fallback', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
      mockGenerateContent.mockReset();
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('prioritizes Groq vision (qwen/qwen3.8-27b) when GROQ_API_KEY is present', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('groq.com')) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      mealName: 'Groq Qwen Meal',
                      items: [{ name: 'Rice & Chicken', calories: 450, proteinG: 40, carbsG: 45, fatG: 10 }],
                    }),
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await executeMultiProviderVision<any>({
        imageBase64: 'fakebase64',
        prompt: 'Analyze food',
        timeoutMs: 1000,
      });

      expect(result.provider).toBe('groq');
      expect(result.model).toBe('qwen/qwen3.8-27b');
      expect(result.data.mealName).toBe('Groq Qwen Meal');
      fetchSpy.mockRestore();
    });

    it('falls over from failed Groq directly to Gemini vision model', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('groq.com')) {
          return new Response(JSON.stringify({ error: { message: 'Groq rate limited' } }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not found', { status: 404 });
      });

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          mealName: 'Gemini Scanned Meal',
          items: [{ name: 'Greek Yogurt Bowl', calories: 220, proteinG: 20, carbsG: 25, fatG: 4 }],
        }),
      });

      const result = await executeMultiProviderVision<any>({
        imageBase64: 'fakebase64',
        prompt: 'Analyze food',
        timeoutMs: 1000,
      });

      expect(result.provider).toBe('gemini');
      expect(result.data.mealName).toBe('Gemini Scanned Meal');
      fetchSpy.mockRestore();
    });

    it('supports OpenRouter vision when explicitly configured with non-free model', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';
      OPENROUTER_VISION_MODELS.push('custom/enterprise-vision');

      try {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
          if (String(url).includes('groq.com')) {
            return new Response(JSON.stringify({ error: { message: 'Groq rate limited' } }), {
              status: 429,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (String(url).includes('openrouter.ai')) {
            return new Response(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        mealName: 'OpenRouter Scanned Meal',
                        items: [{ name: 'Rice & Chicken', calories: 450, proteinG: 40, carbsG: 45, fatG: 10 }],
                      }),
                    },
                  },
                ],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response('Not found', { status: 404 });
        });

        const result = await executeMultiProviderVision<any>({
          imageBase64: 'fakebase64',
          prompt: 'Analyze food',
          timeoutMs: 1000,
        });

        expect(result.provider).toBe('openrouter');
        expect(result.data.mealName).toBe('OpenRouter Scanned Meal');
        fetchSpy.mockRestore();
      } finally {
        OPENROUTER_VISION_MODELS.length = 0;
      }
    });

    it('blocks OpenRouter free-tier (:free) models from receiving meal photos to protect user data', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';
      OPENROUTER_VISION_MODELS.push('meta/llama-3.2-11b-vision:free');

      try {
        await expect(
          executeMultiProviderVision({
            imageBase64: 'fakebase64',
            prompt: 'Analyze food',
            timeoutMs: 1000,
          })
        ).rejects.toThrow(/prohibited for user meal photos/);
      } finally {
        OPENROUTER_VISION_MODELS.length = 0;
      }
    });

    it('aborts immediately and cancels downstream attempts when signal is aborted', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';

      const abortController = new AbortController();
      abortController.abort(); // already aborted

      await expect(
        executeMultiProviderVision({
          imageBase64: 'fakebase64',
          prompt: 'Analyze food',
          timeoutMs: 1000,
          signal: abortController.signal,
        })
      ).rejects.toThrow();
    });

    it('throws error when all vision providers fail', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(JSON.stringify({ error: { message: 'OpenRouter down' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      mockGenerateContent.mockRejectedValue(new Error('Gemini quota exceeded'));

      await expect(
        executeMultiProviderVision({
          imageBase64: 'fakebase64',
          prompt: 'Analyze food',
          timeoutMs: 1000,
        })
      ).rejects.toThrow(/All vision AI providers/);

      fetchSpy.mockRestore();
    });

    it('uses Cloudflare vision when Groq fails and Cloudflare keys are present', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'mock_cf_account_id_12345';
      process.env.CLOUDFLARE_API_TOKEN = 'mock_cf_api_token_12345';
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';

      let cfRequestBody: any = null;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        if (String(url).includes('groq.com')) {
          return new Response(JSON.stringify({ error: { message: 'Groq rate limited' } }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (String(url).includes('api.cloudflare.com')) {
          cfRequestBody = JSON.parse(String(init?.body || '{}'));
          return new Response(
            JSON.stringify({
              success: true,
              errors: [],
              result: {
                response: JSON.stringify({
                  mealName: 'Cloudflare Scanned Meal',
                  items: [{ name: 'Dal & Rice', calories: 380, proteinG: 14, carbsG: 62, fatG: 8 }],
                }),
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await executeMultiProviderVision<any>({
        imageBase64: 'fakebase64',
        prompt: 'Analyze food',
        timeoutMs: 1000,
      });

      expect(result.provider).toBe('cloudflare');
      expect(result.model).toBe('@cf/meta/llama-3.2-11b-vision-instruct');
      expect(result.data.mealName).toBe('Cloudflare Scanned Meal');
      // Verifies the documented Workers AI REST shape: messages + image data URL, no wrapper
      expect(cfRequestBody.messages).toBeDefined();
      expect(cfRequestBody.image).toBe('data:image/jpeg;base64,fakebase64');
      fetchSpy.mockRestore();
    });

    it('falls over from failed Cloudflare to Gemini vision model', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'mock_cf_account_id_12345';
      process.env.CLOUDFLARE_API_TOKEN = 'mock_cf_api_token_12345';
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('groq.com')) {
          return new Response(JSON.stringify({ error: { message: 'Groq rate limited' } }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (String(url).includes('api.cloudflare.com')) {
          return new Response(
            JSON.stringify({ success: false, errors: [{ message: 'Model unavailable' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          mealName: 'Gemini After Cloudflare Meal',
          items: [{ name: 'Idli', calories: 180, proteinG: 6, carbsG: 34, fatG: 2 }],
        }),
      });

      const result = await executeMultiProviderVision<any>({
        imageBase64: 'fakebase64',
        prompt: 'Analyze food',
        timeoutMs: 1000,
      });

      expect(result.provider).toBe('gemini');
      expect(result.data.mealName).toBe('Gemini After Cloudflare Meal');
      fetchSpy.mockRestore();
    });

    it('skips Cloudflare when its keys are absent and falls through to Gemini', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_TOKEN;
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('groq.com')) {
          return new Response(JSON.stringify({ error: { message: 'Groq rate limited' } }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not found', { status: 404 });
      });

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          mealName: 'Gemini No Cloudflare Meal',
          items: [{ name: 'Upma', calories: 240, proteinG: 6, carbsG: 42, fatG: 6 }],
        }),
      });

      const result = await executeMultiProviderVision<any>({
        imageBase64: 'fakebase64',
        prompt: 'Analyze food',
        timeoutMs: 1000,
      });

      expect(result.provider).toBe('gemini');
      expect(fetchSpy.mock.calls.some(([url]: any[]) => String(url).includes('cloudflare.com'))).toBe(false);
      fetchSpy.mockRestore();
    });

    it('enforces one shared wall-clock deadline when all providers hang or time out', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';

      // Simulate network requests hanging until abort
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init: any) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => reject(new Error('AbortError')));
          }
        });
      });

      mockGenerateContent.mockImplementation((params: any) => {
        return new Promise((_resolve, reject) => {
          const signal = params?.config?.abortSignal;
          if (signal) {
            signal.addEventListener('abort', () => reject(new Error('AbortError')));
          }
        });
      });

      const deadlineMs = 300;
      const start = Date.now();

      await expect(
        executeMultiProviderVision({
          imageBase64: 'fakebase64',
          prompt: 'Analyze food',
          timeoutMs: deadlineMs,
        })
      ).rejects.toThrow(/timed out within the shared|wall-clock deadline|All vision AI providers failed/);

      const elapsed = Date.now() - start;
      // Proves the shared deadline aborted early rather than accumulating sequential timeouts (5s+6s+8s)
      expect(elapsed).toBeGreaterThanOrEqual(200);
      expect(elapsed).toBeLessThan(1500);

      fetchSpy.mockRestore();
    });
  });

  describe('executeMultiProviderText cascading fallback', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
      mockGenerateContent.mockReset();
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('prioritizes Groq as Stage 1 for text inference', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('groq.com')) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      advice: 'Focus on progressive overload and rest.',
                    }),
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await executeMultiProviderText<any>({
        prompt: 'Give advice',
        timeoutMs: 1000,
      });

      expect(result.provider).toBe('groq');
      expect(result.data.advice).toBe('Focus on progressive overload and rest.');
      fetchSpy.mockRestore();
    });

    it('falls over from failed Groq to OpenRouter text model', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('groq.com')) {
          return new Response(JSON.stringify({ error: { message: 'Groq unavailable' } }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (String(url).includes('openrouter.ai')) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      plan: 'OpenRouter Workout Plan',
                    }),
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await executeMultiProviderText<any>({
        prompt: 'Generate plan',
        timeoutMs: 1000,
      });

      expect(result.provider).toBe('openrouter');
      expect(result.data.plan).toBe('OpenRouter Workout Plan');
      fetchSpy.mockRestore();
    });

    it('falls over to Gemini when OpenRouter text model fails', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('openrouter.ai')) {
          return new Response(JSON.stringify({ error: { message: 'OpenRouter down' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not found', { status: 404 });
      });

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          plan: 'Gemini Workout Plan',
        }),
      });

      const result = await executeMultiProviderText<any>({
        prompt: 'Generate plan',
        timeoutMs: 1000,
      });

      expect(result.provider).toBe('gemini');
      expect(result.data.plan).toBe('Gemini Workout Plan');
      fetchSpy.mockRestore();
    });

    it('aborts text execution immediately when signal is cancelled', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';

      const controller = new AbortController();
      controller.abort();

      await expect(
        executeMultiProviderText({
          prompt: 'Generate plan',
          timeoutMs: 1000,
          signal: controller.signal,
        })
      ).rejects.toThrow();
    });

    it('enforces one shared wall-clock deadline when all text providers hang or time out', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init: any) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => reject(new Error('AbortError')));
          }
        });
      });

      mockGenerateContent.mockImplementation((params: any) => {
        return new Promise((_resolve, reject) => {
          const signal = params?.config?.abortSignal;
          if (signal) {
            signal.addEventListener('abort', () => reject(new Error('AbortError')));
          }
        });
      });

      const deadlineMs = 300;
      const start = Date.now();

      await expect(
        executeMultiProviderText({
          prompt: 'Generate plan',
          timeoutMs: deadlineMs,
        })
      ).rejects.toThrow(/timed out within the shared|wall-clock deadline|All text AI providers failed/);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(200);
      expect(elapsed).toBeLessThan(1500);

      fetchSpy.mockRestore();
    });

    it('aborts text execution mid-flight when client signal is cancelled and cleans up active requests', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';

      let receivedSignal: AbortSignal | undefined;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init: any) => {
        receivedSignal = init?.signal;
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => reject(new Error('AbortError')));
          }
        });
      });

      const controller = new AbortController();
      const promise = executeMultiProviderText({
        prompt: 'Generate plan',
        timeoutMs: 5000,
        signal: controller.signal,
      });

      // Abort after 40ms while in-flight
      setTimeout(() => controller.abort(), 40);

      await expect(promise).rejects.toThrow();
      expect(receivedSignal?.aborted).toBe(true);

      fetchSpy.mockRestore();
    });
  });
});
