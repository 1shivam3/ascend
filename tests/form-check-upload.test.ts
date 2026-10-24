import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { RepCounter, type FormFrame, type LiftId, type PoseLandmark } from '@/lib/form-check';
import { en } from '@/lib/i18n/en';
import { hi } from '@/lib/i18n/hi';
import { translate } from '@/lib/i18n';

/**
 * Video-upload form check (v1): instead of only the live camera, the
 * user can pick a recorded video file, which runs through the SAME
 * video element, pose engine, counter, gate, cues, and debug readout
 * as live camera — but stepped offline (seek → detect → repeat),
 * NOT through the real-time rAF loop: real-time playback on a slow
 * phone samples ~1.5 fps and the counter's taint rule + 2-frame
 * confirms turn that into 0 reps, even when the model reads every
 * frame perfectly. This also diagnoses the persistent unclear-box
 * problem: if an uploaded video of the same squat counts reps while
 * live camera does not, the fault is live-camera-path specific; if
 * both fail identically, it is input/model-wide.
 *
 * The section needs video + landmarker, so — like the framing and
 * diagnostic tests — section wiring is pinned with a static harness
 * over FormCheckSection.tsx, and the shared engine is pinned with
 * pure counter tests (the upload path feeds this same counter; there
 * is no second counting implementation).
 *
 * Conventions mirror tests/form-check.test.ts: left side exact, right
 * side = left x + 0.02 (a side view), visibility 1 unless overridden.
 */

const LM_IDX = {
  shoulder: 11,
  elbow: 13,
  wrist: 15,
  hip: 23,
  knee: 25,
  ankle: 27,
} as const;

type Joints = {
  shoulder: [number, number];
  hip: [number, number];
  knee: [number, number];
  ankle: [number, number];
  elbow: [number, number];
  wrist: [number, number];
};

function landmarks(j: Joints, vis = 1, rightDx = 0.02): PoseLandmark[] {
  const out: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
  }));
  (Object.keys(j) as (keyof Joints)[]).forEach((key) => {
    const [x, y] = j[key];
    const left = LM_IDX[key];
    out[left] = { x, y, visibility: vis };
    out[left + 1] = { x: x + rightDx, y, visibility: vis };
  });
  return out;
}

function frame(j: Joints, t: number): FormFrame {
  return { landmarks: landmarks(j), timestampMs: t };
}

/** n frames of one preset, 500 ms apart, starting at t0. */
function run(j: Joints, n: number, t0: number, step = 500): FormFrame[] {
  return Array.from({ length: n }, (_, i) => frame(j, t0 + i * step));
}

/** Squat: knee 180 standing / 95 deep. */
const SQUAT_TOP: Joints = {
  shoulder: [0.5, 0.2], hip: [0.5, 0.5], knee: [0.5, 0.8], ankle: [0.5, 1.0],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};
const SQUAT_DEEP: Joints = {
  shoulder: [0.45, 0.2], hip: [0.4, 0.5], knee: [0.6, 0.8], ankle: [0.35, 1.0],
  elbow: [0.5, 0.3], wrist: [0.5, 0.1],
};

/** Full-rep frame list: top×2, bottom×2, top×4 (confirm + hysteresis). */
function fullRep(top: Joints, bottom: Joints, t0 = 0): FormFrame[] {
  return [...run(top, 2, t0), ...run(bottom, 2, t0 + 1000), ...run(top, 4, t0 + 2000)];
}

function feed(lift: LiftId, frames: FormFrame[]): RepCounter {
  const c = new RepCounter(lift);
  for (const f of frames) c.processFrame(f);
  return c;
}

const SECTION = readFileSync(
  join(process.cwd(), 'src/components/FormCheckSection.tsx'),
  'utf8'
);

/** Source region between two anchors (exclusive of the end anchor). */
function region(src: string, from: string, to: string): string {
  const start = src.indexOf(from);
  expect(start, `anchor not found: ${from}`).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(to, start + from.length);
  expect(end, `anchor not found: ${to}`).toBeGreaterThan(0);
  return src.slice(start, end);
}

describe('upload i18n parity (en + hi, real copy)', () => {
  const keys = [
    'formcheck.uploadVideo',
    'formcheck.uploadHint',
    'formcheck.uploadLoading',
    'formcheck.chooseAnotherVideo',
    'formcheck.errUploadTitle',
    'formcheck.errUploadMessage',
    'formcheck.errUploadTry',
  ] as const;
  const devanagari = /[\u0900-\u097F]/;
  for (const key of keys) {
    it(`${key} exists in en and hi with real, differing copy`, () => {
      expect(en[key], `en missing ${key}`).toBeTruthy();
      expect(hi[key], `hi missing ${key}`).toBeTruthy();
      expect(translate('hi', key), `hi ${key} fell back to raw key`).not.toBe(key);
      expect(translate('hi', key), `hi ${key} has no Devanagari`).toMatch(devanagari);
      expect(translate('hi', key), `hi ${key} identical to en`).not.toBe(
        translate('en', key)
      );
    });
  }
});

describe('upload section contract (static-rendering harness)', () => {
  it('idle offers an upload picker next to the camera option', () => {
    expect(SECTION).toContain('formcheck.uploadVideo');
    expect(SECTION).toContain('formcheck.uploadHint');
    expect(SECTION).toContain('type="file"');
    expect(SECTION).toContain('accept="video/*"');
    // Picking the same file again after an error must work.
    expect(SECTION).toContain("e.target.value = ''");
  });

  it('upload runs the SAME counter via seek-based analysis, never the live loop or the camera', () => {
    const upload = region(SECTION, 'const startUpload', 'const switchCamera');
    expect(upload).toContain('URL.createObjectURL');
    expect(upload).toContain('new RepCounter(lift)');
    expect(upload).toContain('void analyzeUpload()');
    expect(upload).toContain('waitForMetadata');
    // Priming, not continuous playback: play() briefly inside the
    // helper (which pauses right after play resolves — pinned
    // behaviorally in form-check-upload-prime.test.ts), then
    // stepping owns currentTime. No rAF loop, no direct play()
    // call, no camera on this path.
    expect(upload).toContain('primeVideoForAnalysis(video)');
    expect(upload).not.toContain('requestAnimationFrame(loop)');
    expect(upload).not.toContain('video.play()');
    expect(upload).not.toContain('getUserMedia');
    // The stepping loop itself: seeks + detects each stepped frame
    // through the same counter, with a token-guarded exit.
    const analysis = region(SECTION, 'const analyzeUpload', 'const startUpload');
    expect(analysis).toContain('computeUploadStepTimes');
    expect(analysis).toContain('seekVideoTo');
    expect(analysis).toContain('nextAnalysisTimestamp');
    expect(analysis).toContain('handleCounterFrame');
    expect(analysis).toContain('analysisTokenRef');
    expect(analysis).toContain('endSet(false)');
    // The camera path still asks for the camera and runs the live loop (unchanged).
    const camera = region(SECTION, 'const start = ', 'const startUpload');
    expect(camera).toContain('getUserMedia');
    expect(camera).toContain('requestAnimationFrame(loop)');
  });

  it('upload failures show the upload error box, never a camera prompt', () => {
    const upload = region(SECTION, 'const startUpload', 'const switchCamera');
    expect(upload).toContain('formcheck.errUploadTitle');
    expect(upload).toContain('formcheck.errUploadMessage');
    expect(upload).toContain('formcheck.errUploadTry');
    // The video element's own decode error is the same box, gated to
    // the upload source so camera-path errors stay out.
    expect(SECTION).toContain('onError={() => {');
    expect(SECTION).toContain("sourceRef.current !== 'upload'");
  });

  it('video end finishes the set like End set on live', () => {
    expect(SECTION).toContain('onEnded={() => {');
    expect(SECTION).toContain("sourceRef.current === 'upload'");
    // endSet is what produces the post-set summary.
    expect(SECTION).toContain('endSet(false)');
  });

  it('leaving upload revokes the object URL on every exit path', () => {
    expect(SECTION).toContain('URL.revokeObjectURL');
    const endSet = region(SECTION, 'const endSet', '// Unmount');
    expect(endSet).toContain('revokeUpload()');
    const camera = region(SECTION, 'const start = ', 'const startUpload');
    expect(camera).toContain('revokeUpload()');
    expect(camera).toContain("setSource('camera')");
    const upload = region(SECTION, 'const startUpload', 'const switchCamera');
    expect(upload).toContain('revokeUpload()');
    const unmount = region(SECTION, '// Unmount', 'const cfg = ');
    expect(unmount).toContain('URL.revokeObjectURL');
  });

  it('camera switching is hidden on the upload path; upload is never mirrored', () => {
    expect(SECTION).toContain("{source === 'camera' && (");
    expect(SECTION).toContain("source === 'camera' && facing === 'user'");
  });

  it('loading copy and error actions are source-aware', () => {
    expect(SECTION).toContain('formcheck.uploadLoading');
    expect(SECTION).toContain('formcheck.chooseAnotherVideo');
    expect(SECTION).toContain('uploadError ?');
  });

  it('exactly one counter class serves both sources', () => {
    const sites = SECTION.match(/new RepCounter\(/g) ?? [];
    expect(sites).toHaveLength(2); // camera start + upload start
    expect(SECTION).not.toContain('UploadCounter');
  });
});

describe('shared counter fed by the upload path', () => {
  it('counts a full squat rep from frame sequences, ending in a summary', () => {
    const c = feed('squat', fullRep(SQUAT_TOP, SQUAT_DEEP));
    expect(c.repCount).toBe(1);
    const summary = c.endSet('completed', 10000);
    expect(summary.repCount).toBe(1);
  });

  it('an all-dim uploaded view counts nothing, like live', () => {
    const dim = (j: Joints, t: number): FormFrame => ({
      landmarks: landmarks(j, 0.3),
      timestampMs: t,
    });
    const c = new RepCounter('squat');
    for (let i = 0; i < 8; i++) c.processFrame(dim(SQUAT_DEEP, i * 500));
    expect(c.repCount).toBe(0);
  });
});
