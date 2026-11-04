/**
 * Open-items SEC F-06 (P3): CSP script-src 'unsafe-inline'.
 *
 * Re-attempted for this batch. The nonce route stays impossible for
 * statically prerendered pages (SEC-16 live test: nonce present in the
 * header, on 0 of 8 inline scripts — hydration would break), and a
 * hash allowlist is impossible because the inline scripts are Next
 * flight-data payloads whose bytes are page-specific JSON.
 *
 * The tightest safe tightening WAS applied and is pinned here:
 * object-src 'none' and script-src-attr 'none' join the policy;
 * frame-ancestors / base-uri / form-action were already restrictive.
 * script-src 'unsafe-inline' remains (documented in next.config.js),
 * compensated by the zero-sink scan (no dangerouslySetInnerHTML /
 * eval / new Function in src) and CSP violation reporting.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const cfg = fs.readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8');
const directive = (name: string) =>
  cfg.match(new RegExp(`"${name} [^"]*"`))?.[0] ?? '';

describe('open-items SEC F-06: CSP tightening', () => {
  it("object-src is 'none' (no plugin content is ever legitimate)", () => {
    expect(directive('object-src')).toBe('"object-src \'none\'"');
  });

  it("script-src-attr is 'none' (no inline event handlers anywhere)", () => {
    expect(directive('script-src-attr')).toBe('"script-src-attr \'none\'"');
  });

  it('the already-restrictive directives stay restrictive', () => {
    expect(directive('frame-ancestors')).toContain("'none'");
    expect(directive('base-uri')).toContain("'self'");
    expect(directive('form-action')).toContain("'self'");
    expect(directive('default-src')).toContain("'self'");
  });

  it("script-src: no 'unsafe-eval', ever; 'wasm-unsafe-eval' scoped for MediaPipe; 'unsafe-inline' stays per the documented SEC-16 verdict", () => {
    const scriptSrc = directive('script-src');
    expect(scriptSrc).not.toMatch(/(^|\s)'unsafe-eval'(\s|$)/);
    expect(scriptSrc).toContain("'wasm-unsafe-eval'");
    expect(scriptSrc).toContain('unsafe-inline');
    // The reason must stay documented next to the policy.
    expect(cfg).toContain('SEC-16');
    expect(cfg).toContain('SEC F-06');
  });

  it('violation reporting stays wired (SEC-17 compensation)', () => {
    expect(cfg).toContain('report-uri /api/csp-report');
    expect(cfg).toContain('Reporting-Endpoints');
  });
});
