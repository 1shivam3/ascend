import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// PNG IHDR dimensions without an image library: signature(8) + length(4)
// + 'IHDR'(4) + width(4 BE) + height(4 BE).
function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const pub = (f: string) => path.resolve('public', f);

describe('logo icon set (flame-2 mark)', () => {
  it('ships the full PWA set at the right dimensions', () => {
    expect(pngSize(pub('icon-192.png'))).toEqual({ width: 192, height: 192 });
    expect(pngSize(pub('icon-512.png'))).toEqual({ width: 512, height: 512 });
    expect(pngSize(pub('icon-maskable-512.png'))).toEqual({ width: 512, height: 512 });
  });

  it('keeps the manifest references intact (filenames unchanged)', () => {
    const manifest = JSON.parse(fs.readFileSync(pub('manifest.json'), 'utf8'));
    const srcs = (manifest.icons as { src: string }[]).map((i) => i.src);
    expect(srcs).toEqual(['/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']);
  });

  it('icon.svg is self-contained (embedded raster, not a stale vector)', () => {
    const svg = fs.readFileSync(pub('icon.svg'), 'utf8');
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toContain('data:image/png;base64,');
    expect(svg).not.toContain('#e5c07b'); // old gold A must be gone
  });

  it('favicon.ico exists for the existing /favicon.ico reference', () => {
    const buf = fs.readFileSync(pub('favicon.ico'));
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(1); // ICO magic
    expect(buf[3]).toBe(0);
  });
});

