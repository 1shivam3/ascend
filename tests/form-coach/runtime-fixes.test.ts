import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getClarityProjectId } from '../../src/lib/telemetry';

describe('Form Coach Runtime Fixes Verification', () => {
  it('CSP in next.config.js allows wasm-unsafe-eval and forbids broad unsafe-eval', () => {
    const configPath = path.join(process.cwd(), 'next.config.js');
    const content = fs.readFileSync(configPath, 'utf8');

    const scriptSrcMatch = content.match(/"script-src[^"]*"/);
    expect(scriptSrcMatch).toBeTruthy();
    const scriptSrc = scriptSrcMatch![0];

    // Narrowly scoped WASM eval allowed
    expect(scriptSrc).toContain("'wasm-unsafe-eval'");
    // Broad JS eval strictly forbidden
    expect(scriptSrc).not.toMatch(/(^|\s)'unsafe-eval'(\s|$)/);
    // Preserves self and allowed analytics origins
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain('https://www.googletagmanager.com');
  });

  it('Root layout synchronizes data-theme="dark" with className="dark" to prevent hydration mismatch', () => {
    const layoutPath = path.join(process.cwd(), 'src/app/layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf8');

    expect(content).toContain('<html lang="en" className="dark" data-theme="dark">');
  });

  it('Telemetry utility filters out invalid/non-web clarity project IDs', () => {
    const originalEnv = process.env.NEXT_PUBLIC_CLARITY_ID;

    try {
      process.env.NEXT_PUBLIC_CLARITY_ID = 'ywdt5rqnzv';
      expect(getClarityProjectId()).toBeUndefined();

      process.env.NEXT_PUBLIC_CLARITY_ID = 'your_clarity_project_id';
      expect(getClarityProjectId()).toBeUndefined();

      process.env.NEXT_PUBLIC_CLARITY_ID = '   ';
      expect(getClarityProjectId()).toBeUndefined();

      process.env.NEXT_PUBLIC_CLARITY_ID = 'valid_clarity_id_123';
      expect(getClarityProjectId()).toBe('valid_clarity_id_123');
    } finally {
      process.env.NEXT_PUBLIC_CLARITY_ID = originalEnv;
    }
  });
});
