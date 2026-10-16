import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanAndParseJson, executeMultiProviderVision, executeMultiProviderText } from '@/lib/ai-provider';

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
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('falls over from failed Gemini to OpenRouter vision model', async () => {
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';

      // Mock fetch: OpenRouter succeeds
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('openrouter.ai')) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      mealName: 'OpenRouter Scanned Meal',
                      items: [{ name: 'Oatmeal', calories: 250, proteinG: 10, carbsG: 40, fatG: 5 }],
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

      // Execute vision call (Gemini fails, Groq vision skipped, OpenRouter succeeds)
      const result = await executeMultiProviderVision<any>({
        imageBase64: 'fakebase64',
        prompt: 'Analyze food',
        timeoutMs: 1000,
      });

      expect(result.provider).toBe('openrouter');
      expect(result.data.mealName).toBe('OpenRouter Scanned Meal');
      fetchSpy.mockRestore();
    });
  });

  describe('executeMultiProviderText cascading fallback', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('falls over from failed Gemini to Groq text model', async () => {
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';

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

    it('falls over to OpenRouter when both Gemini and Groq fail', async () => {
      process.env.GEMINI_API_KEY = 'mock_gemini_key_12345';
      process.env.GROQ_API_KEY = 'gsk_mock_groq_key_12345';
      process.env.OPENROUTER_API_KEY = 'sk-or-mock_openrouter_key_12345';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('groq.com')) {
          return new Response(JSON.stringify({ error: { message: 'Rate limited' } }), {
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
  });
});
