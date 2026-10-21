import { describe, it, expect } from 'vitest';
import { toUserMessage } from '../src/lib/user-error';

const msg = (err: unknown, ctx: 'scan' | 'image' | 'generic' = 'scan') =>
  toUserMessage(err, ctx, false);

describe('toUserMessage (QA4-016)', () => {
  it('strips URLs, status codes and provider JSON from raw SDK errors', () => {
    const err = new Error(
      'POST https://api.groq.com/openai/v1/chat/completions failed 429 {"error":{"message":"rate limited"}}',
    );
    const out = msg(err);
    expect(out).not.toMatch(/https?:\/\//);
    expect(out).not.toContain('429');
    expect(out).not.toMatch(/groq/i);
    expect(out).not.toContain('{');
  });

  it('never echoes provider names or API-key vocabulary', () => {
    for (const raw of [
      'GEMINI_API_KEY is not configured',
      'All vision AI providers failed: OpenRouter 401',
      'Invalid API key provided for openai',
    ]) {
      const out = msg(new Error(raw));
      expect(out).not.toMatch(/gemini|groq|openrouter|openai|api.?key/i);
      expect(out).toContain('temporarily unavailable');
    }
  });

  it('maps NO_API_KEY / 503 error objects to the unavailable copy', () => {
    expect(msg({ code: 'NO_API_KEY', message: 'x' })).toContain('temporarily unavailable');
    expect(msg({ status: 503, message: 'Service Unavailable' })).toContain(
      'temporarily unavailable',
    );
  });

  it('maps network failures to actionable offline copy', () => {
    const out = msg(new TypeError('Failed to fetch'));
    expect(out).toContain('No connection');
    expect(out).not.toContain('Failed to fetch');
  });

  it('maps quota / memory errors to device guidance', () => {
    const out = msg({ name: 'QuotaExceededError', message: 'quota exceeded' }, 'image');
    expect(out).toContain('low on memory or storage');
  });

  it('maps timeouts to retry copy', () => {
    expect(msg(new Error('Request timed out after 30000ms'))).toContain('timed out');
  });

  it('rate-limit errors never surface the status code', () => {
    const out = msg({ status: 429, message: 'Too Many Requests' });
    expect(out).toContain('wait a moment');
    expect(out).not.toContain('429');
  });

  it('raw JS exceptions fall back to generic copy', () => {
    expect(msg(new Error("Unexpected token '<', \"<html>\"... is not valid JSON"))).toBe(
      'Could not analyze this photo. Please try again, or use manual food search or the offline estimate below.',
    );
    expect(msg(new TypeError("Cannot read properties of undefined (reading 'items')"), 'generic')).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('non-Error values are handled', () => {
    expect(msg(null)).toContain('Could not analyze');
    expect(msg(undefined, 'generic')).toBe('Something went wrong. Please try again.');
    expect(msg(42 as unknown)).toContain('Could not analyze');
  });

  it('short plain messages written by our own code pass through', () => {
    expect(msg(new Error('Please enter a valid age.'))).toBe('Please enter a valid age.');
  });

  it('abort reads as a cancellation, not an error', () => {
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    expect(msg(e)).toBe('Cancelled.');
  });
});
