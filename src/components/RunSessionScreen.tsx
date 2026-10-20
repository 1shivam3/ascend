'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Pause, Play, SkipForward, Flag, Footprints } from 'lucide-react';
import {
  buildIntervalSchedule,
  buildRunWorkoutEntry,
  type RunSession,
  type IntervalPhaseKind,
} from '@/lib/run-program';
import type { WorkoutEntry } from '@/lib/types';
import { getLocalTodayStr, safeRandomId } from '@/lib/formatters';
import { useTranslation } from '@/lib/i18n';
import { useEscapeToClose } from '@/lib/use-escape-to-close';

interface RunSessionScreenProps {
  session: RunSession;
  onFinish: (entry: WorkoutEntry) => void;
  onCancel: () => void;
}

function vibrate(kind: 'run' | 'walk' | 'finish') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    if (kind === 'run') navigator.vibrate([120, 80, 120, 80, 240]);
    else if (kind === 'finish') navigator.vibrate([60, 40, 80, 40, 120]);
    else navigator.vibrate([45, 35, 45]);
  } catch {
    // Unsupported — cues are best-effort.
  }
}

function beep(times: number) {
  try {
    if (typeof window === 'undefined') return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.22;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, start);
      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    }
  } catch {
    // Audio can be blocked until a user gesture; vibration still fires.
  }
}

function cue(kind: 'run' | 'walk' | 'finish') {
  vibrate(kind);
  beep(kind === 'run' ? 2 : 1);
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Run session player — walks the user through the interval schedule with
 * a big countdown, next-phase preview, and vibration + beep cues at every
 * transition (same cue language as the gym rest timer). Timing is
 * timestamp-based, so a busy main thread can't drift the phases.
 */
export default function RunSessionScreen({ session, onFinish, onCancel }: RunSessionScreenProps) {
  const { t } = useTranslation();
  const phases = useMemo(() => buildIntervalSchedule(session), [session]);
  const bodyTotal = phases.length - 2; // exclude warm-up + cool-down

  const [phaseIdx, setPhaseIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(phases[0].seconds);
  const [isRunning, setIsRunning] = useState(true);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState('');

  const phaseLeftRef = useRef(phases[0].seconds);
  const lastTickRef = useRef(0);
  const completedBodyRef = useRef(0);
  const phaseIdxRef = useRef(0);

  useEscapeToClose(!finished, onCancel);

  const phaseLabel = (kind: IntervalPhaseKind): string =>
    kind === 'run'
      ? t('run.runPhase')
      : kind === 'walk'
        ? t('run.walkPhase')
        : kind === 'warmup'
          ? t('run.warmup')
          : t('run.cooldown');

  const advance = (natural: boolean) => {
    const current = phases[phaseIdxRef.current];
    if (natural && current && current.kind !== 'warmup' && current.kind !== 'cooldown') {
      completedBodyRef.current += 1;
    }
    const next = phaseIdxRef.current + 1;
    if (next >= phases.length) {
      cue('finish');
      setFinished(true);
      setIsRunning(false);
      return;
    }
    phaseIdxRef.current = next;
    setPhaseIdx(next);
    phaseLeftRef.current = phases[next].seconds;
    setSecondsLeft(phases[next].seconds);
    const kind = phases[next].kind;
    cue(kind === 'run' ? 'run' : kind === 'walk' ? 'walk' : 'walk');
  };

  useEffect(() => {
    if (!isRunning || finished) return;
    lastTickRef.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      phaseLeftRef.current -= dt;
      setElapsed((e) => e + dt);
      if (phaseLeftRef.current <= 0) {
        advance(true);
      } else {
        setSecondsLeft(Math.ceil(phaseLeftRef.current));
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, finished, phaseIdx]);

  const current = phases[phaseIdx];
  const nextPhase = phases[phaseIdx + 1];
  const totalSeconds = useMemo(() => phases.reduce((a, p) => a + p.seconds, 0), [phases]);
  const overallPct = Math.min(100, Math.round((elapsed / totalSeconds) * 100));

  const phaseColor =
    current?.kind === 'run'
      ? 'text-accent'
      : current?.kind === 'walk'
        ? 'text-sky-400'
        : 'text-text-secondary';

  const handleSave = () => {
    const km = parseFloat(distance);
    onFinish(
      buildRunWorkoutEntry({
        id: safeRandomId('run'),
        session,
        date: getLocalTodayStr(),
        durationSeconds: elapsed,
        intervalsCompleted: completedBodyRef.current,
        intervalsTotal: bodyTotal,
        ...(Number.isFinite(km) && km > 0 ? { distanceKm: km } : {}),
      }),
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary text-text-primary flex flex-col overflow-hidden select-none animate-fade-in font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
            <Footprints className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{t('run.programName')}</p>
            <p className="text-2xs text-text-muted">
              {t('run.sessionLabel', { week: session.week, day: session.day })}
            </p>
          </div>
        </div>
        {!finished && (
          <button
            type="button"
            onClick={onCancel}
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
            aria-label="Close run"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {!finished ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <p className={`text-2xl font-black uppercase tracking-wide ${phaseColor}`}>
            {phaseLabel(current.kind)}
          </p>
          <p className="text-7xl font-black font-mono tabular-nums leading-none">
            {fmtClock(secondsLeft)}
          </p>
          <div className="w-full max-w-xs space-y-1.5">
            <div className="w-full h-2 rounded-full bg-border/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-3xs text-text-muted font-mono tabular-nums">
              <span>{fmtClock(elapsed)}</span>
              <span>{fmtClock(totalSeconds)}</span>
            </div>
          </div>
          {nextPhase ? (
            <p className="text-xs text-text-secondary">
              {t('run.nextUp', { label: `${phaseLabel(nextPhase.kind)} · ${fmtClock(nextPhase.seconds)}` })}
            </p>
          ) : (
            <p className="text-xs text-text-secondary">{t('run.cooldown')}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsRunning((v) => !v)}
              className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer shadow-lg shadow-accent/25"
              aria-label={isRunning ? t('run.pause') : t('run.resume')}
            >
              {isRunning ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 fill-white" />}
            </button>
            <button
              type="button"
              onClick={() => advance(false)}
              className="h-12 px-4 rounded-full bg-bg-secondary border border-border text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
              {t('run.skipPhase')}
            </button>
            <button
              type="button"
              onClick={() => {
                setFinished(true);
                setIsRunning(false);
              }}
              className="h-12 px-4 rounded-full bg-bg-secondary border border-border text-xs font-bold flex items-center gap-1.5 text-text-secondary active:scale-95 transition-all cursor-pointer"
            >
              <Flag className="w-4 h-4" />
              {t('run.endRun')}
            </button>
          </div>
          <p className="text-3xs text-text-muted">
            {t('run.intervalsDone', { done: completedBodyRef.current, total: bodyTotal })}
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <span className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
            <Flag className="w-7 h-7" />
          </span>
          <p className="text-xl font-black">{t('run.runComplete')}</p>
          <div className="card p-4 w-full max-w-xs space-y-2 text-center">
            <p className="text-3xl font-black font-mono tabular-nums">{fmtClock(elapsed)}</p>
            <p className="text-2xs text-text-muted">
              {t('run.intervalsDone', { done: completedBodyRef.current, total: bodyTotal })}
            </p>
            <label className="block text-left pt-1">
              <span className="text-2xs font-semibold text-text-secondary">{t('run.distanceLabel')}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                placeholder="5.00"
                className="mt-1 w-full bg-bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent outline-none"
              />
            </label>
          </div>
          <div className="flex gap-2 w-full max-w-xs">
            <button
              type="button"
              onClick={onCancel}
              className="py-3 px-4 rounded-xl bg-bg-secondary border border-border text-xs font-bold text-text-secondary flex-1 active:scale-95 transition-all cursor-pointer"
            >
              {t('common.delete')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="py-3 px-4 rounded-xl bg-accent text-white text-xs font-bold flex-1 active:scale-95 transition-all cursor-pointer"
            >
              {t('run.saveRun')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
