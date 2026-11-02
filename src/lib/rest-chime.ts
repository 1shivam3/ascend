/**
 * rest-chime.ts — the rest-timer "rest over" chime, built on ONE shared
 * Web Audio context.
 *
 * Why a singleton: the original implementation (inline in
 * ActiveWorkoutScreen) constructed a brand-new AudioContext at the
 * moment the rest countdown finished. On Android — Chrome and the
 * Capacitor WebView alike — an AudioContext created without a user
 * gesture behind it starts in the `suspended` state: oscillators get
 * scheduled but never sound, so the chime was silently dropped on real
 * phones (owner-reported). The fix is to create/resume the shared
 * context inside user gestures that precede a rest period (set-complete
 * taps, rest start/pause/resume controls) via unlockRestAudio(), then
 * reuse that same context when the countdown finishes.
 *
 * Every export is defensive: unsupported or blocked audio is a silent
 * no-op and must never throw into the workout flow (haptics and the
 * local-notification alert still cover the moment).
 */

/** Ascending motif (Hz): D5 → A5 → D6 — starts from the original
 *  two-note chime (587.33 → 880) and adds the octave for presence. */
export const REST_CHIME_FREQUENCIES: readonly number[] = [587.33, 880, 1174.66];
/** Peak gain per note — up from the original 0.12 so it carries in a gym. */
export const REST_CHIME_PEAK_GAIN = 0.25;
/** Gap between note onsets (s). */
export const REST_CHIME_NOTE_GAP_S = 0.16;
/** Per-note decay length (s); the last note ends ≈0.9 s after the first. */
export const REST_CHIME_NOTE_LENGTH_S = 0.42;

let sharedContext: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  try {
    if (typeof window === 'undefined') return null;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: AudioContextCtor })
        .webkitAudioContext;
    return Ctor ?? null;
  } catch {
    return null;
  }
}

/**
 * The one shared AudioContext, created on first use. Null when Web
 * Audio is unavailable (SSR, very old browsers).
 */
export function getSharedRestAudioContext(): AudioContext | null {
  try {
    if (sharedContext) return sharedContext;
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    sharedContext = new Ctor();
    return sharedContext;
  } catch {
    return null;
  }
}

/**
 * Call from user-gesture handlers that can precede a rest period (set
 * complete, rest start/pause/resume, ±adjust). Creates the shared
 * context if needed and resumes it while the gesture is still on the
 * call stack — the only moment Android reliably allows audio to
 * unlock. Idempotent; safe to call on every tap.
 */
export function unlockRestAudio(): void {
  try {
    const ctx = getSharedRestAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  } catch {
    // Audio is a best-effort cue; never break the workout flow.
  }
}

/**
 * Plays the rest-done chime on the shared context. Resumes first (the
 * OS may have re-suspended the context while the app was backgrounded),
 * then schedules the three-note motif with an exponential decay per
 * note, ringing for ≈0.9 s in total.
 */
export function playRestDoneChime(): void {
  try {
    const ctx = getSharedRestAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const startAt = ctx.currentTime;
    REST_CHIME_FREQUENCIES.forEach((frequency, i) => {
      const noteStart = startAt + i * REST_CHIME_NOTE_GAP_S;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(REST_CHIME_PEAK_GAIN, noteStart);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        noteStart + REST_CHIME_NOTE_LENGTH_S
      );
      osc.start(noteStart);
      osc.stop(noteStart + REST_CHIME_NOTE_LENGTH_S + 0.05);
    });
  } catch {
    // Autoplay restrictions or unsupported audio — haptics still fire.
  }
}

/** Test-only: forget the singleton so a fresh stubbed constructor is used. */
export function __resetRestChimeForTests(): void {
  sharedContext = null;
}
