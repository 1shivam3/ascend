import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  primeVideoForAnalysis,
  UPLOAD_PRIME_TIMEOUT_MS,
  type PlayableVideo,
} from '@/lib/upload-analysis';

/**
 * Prime-then-step for seek-based upload analysis.
 *
 * The hardened build proved the new code was running on the user's
 * phone ("Working on frame 1 of 163…" visible) yet still sat at
 * frame 1 for minutes with no error. Audit of the first-frame
 * conditions:
 *
 * - The first stepped seek (t = 0) is a no-op: the video starts at
 *   currentTime ~0, so seekVideoTo resolves immediately and forces
 *   no frame decode.
 * - The loading-phase warm-up is guarded by readyState >= 2, but a
 *   paused, never-played blob video may sit at readyState 1
 *   (metadata only) on mobile — the browser defers frame decode
 *   for non-playing media — so the warm-up is silently skipped.
 * - Live camera and the old real-time upload path never had this
 *   state: their elements were PLAYING with frames flowing, and
 *   detection returned results on the same phone.
 *
 * So the first stepped detect ran on an unprimed element, unlike
 * every path proven to return results — and the synchronous
 * detectForVideo call blocked there for minutes with no error and
 * no throw (a throw would be caught, the frame skipped, and the
 * run would advance to frame 2; it never did).
 *
 * The fix: prime the element before stepping — play() briefly
 * (the old path proved play() works on this phone), then pause.
 * That forces a real decode and advances readyState, makes the
 * warm-up guard realistic (it now actually runs), and makes the
 * first step a real seek whenever currentTime advanced past
 * epsilon. A priming failure rejects into the existing upload
 * error box — never a silent hang. No counting, gating, model,
 * timeout, step-size, cancellation, or live-camera behavior
 * changes; no new i18n strings (priming failures reuse the upload
 * error box).
 *
 * Pure helper tested directly; section wiring pinned with the
 * static harness (same convention as
 * tests/form-check-upload-firstframe.test.ts).
 */

class FakePlayableVideo {
  pauseCalls = 0;
  playCalls = 0;
  private behavior: 'resolve' | 'reject' | 'never';
  constructor(behavior: 'resolve' | 'reject' | 'never' = 'resolve') {
    this.behavior = behavior;
  }
  play(): Promise<void> {
    this.playCalls += 1;
    if (this.behavior === 'resolve') return Promise.resolve();
    if (this.behavior === 'reject')
      return Promise.reject(new Error('play blocked'));
    return new Promise<void>(() => {});
  }
  pause(): void {
    this.pauseCalls += 1;
  }
}

const SECTION = readFileSync(
  join(process.cwd(), 'src/components/FormCheckSection.tsx'),
  'utf8'
);

function region(src: string, from: string, to: string): string {
  const start = src.indexOf(from);
  expect(start, `anchor not found: ${from}`).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(to, start + from.length);
  expect(end, `anchor not found: ${to}`).toBeGreaterThan(0);
  return src.slice(start, end);
}

describe('primeVideoForAnalysis helper', () => {
  it('resolves and pauses after play() resolves', async () => {
    const video = new FakePlayableVideo('resolve');
    await primeVideoForAnalysis(video as unknown as PlayableVideo);
    expect(video.playCalls).toBe(1);
    // Pause happens only after play resolves: no AbortError from
    // pausing a pending play() is possible.
    expect(video.pauseCalls).toBe(1);
  });

  it('a play() rejection rejects (caller surfaces the upload error box)', async () => {
    const video = new FakePlayableVideo('reject');
    await expect(
      primeVideoForAnalysis(video as unknown as PlayableVideo)
    ).rejects.toThrow('play blocked');
    expect(video.pauseCalls).toBe(0);
  });

  it('a play() that never settles rejects on timeout, never hangs', async () => {
    const video = new FakePlayableVideo('never');
    await expect(
      primeVideoForAnalysis(video as unknown as PlayableVideo, 10)
    ).rejects.toThrow('video playback did not start');
    expect(video.pauseCalls).toBe(0);
  });

  it('the default priming timeout is 10 s', () => {
    expect(UPLOAD_PRIME_TIMEOUT_MS).toBe(10000);
  });
});

describe('prime-then-step section contract (static-rendering harness)', () => {
  it('startUpload primes the video after metadata and before the warm-up', () => {
    const upload = region(SECTION, 'const startUpload', 'const cancelAnalysis');
    const metadataAt = upload.indexOf('await waitForMetadata(video)');
    const primeAt = upload.indexOf('await primeVideoForAnalysis(video)');
    const warmupAt = upload.indexOf('Best-effort warm-up');
    expect(metadataAt, 'metadata wait missing').toBeGreaterThanOrEqual(0);
    expect(primeAt, 'priming call missing').toBeGreaterThan(0);
    expect(warmupAt, 'warm-up missing').toBeGreaterThan(0);
    expect(primeAt, 'priming must follow metadata').toBeGreaterThan(metadataAt);
    expect(primeAt, 'priming must precede the warm-up').toBeLessThan(warmupAt);
  });

  it('priming failures land in the existing upload error box, never silently', () => {
    const upload = region(SECTION, 'const startUpload', 'const cancelAnalysis');
    expect(upload).toContain('primeVideoForAnalysis(video)');
    // The surrounding try/catch maps non-engine errors to the
    // upload error box; priming rejects into that same path.
    expect(upload).toContain('formcheck.errUploadTitle');
    expect(upload).toContain('setUploadError(true)');
  });

  it('the warm-up guard is intact and now realistic on a primed element', () => {
    const upload = region(SECTION, 'const startUpload', 'const cancelAnalysis');
    expect(upload).toContain('readyState >= 2');
    expect(upload).toContain('Warm-up is best-effort only.');
    expect(upload).not.toContain('handleCounterFrame');
  });

  it('live camera path has no priming (camera start untouched)', () => {
    const camera = region(SECTION, 'const start = ', 'const analyzeUpload');
    expect(camera).not.toContain('primeVideoForAnalysis');
  });

  it('stepping, seek timeout, and cancellation behavior are intact', () => {
    const analysis = region(SECTION, 'const analyzeUpload', 'const startUpload');
    expect(analysis).toContain('seekVideoTo');
    expect(analysis).toContain('formcheck.errSeekTitle');
    const cancel = region(SECTION, 'const cancelAnalysis', 'const switchCamera');
    expect(cancel).toContain('analysisTokenRef.current += 1');
    expect(cancel).toContain("setPhase('idle')");
  });
});
