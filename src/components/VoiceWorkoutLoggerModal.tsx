"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  parseHinglishWorkoutVoice,
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  VoiceWorkoutResult,
} from '@/lib/voice-logger';
import {
  Mic,
  MicOff,
  X,
  Check,
  RotateCcw,
  Sparkles,
  Plus,
  Minus,
  Globe,
  SlidersHorizontal,
} from 'lucide-react';
import { useToast } from './ui/Toast';

interface VoiceWorkoutLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentExerciseName?: string;
  defaultUnit?: 'kg' | 'lbs';
  onApplySet: (result: VoiceWorkoutResult) => void;
}

export default function VoiceWorkoutLoggerModal({
  isOpen,
  onClose,
  currentExerciseName,
  defaultUnit = 'kg',
  onApplySet,
}: VoiceWorkoutLoggerModalProps) {
  const toast = useToast();

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsedResult, setParsedResult] = useState<VoiceWorkoutResult | null>(null);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [autoApplyCountdown, setAutoApplyCountdown] = useState<number | null>(null);
  const [speechLang, setSpeechLang] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const [parseError, setParseError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestTranscriptRef = useRef<string>('');

  const supported = isSpeechRecognitionSupported();

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
  }, []);

  const resetState = useCallback(() => {
    setTranscript('');
    latestTranscriptRef.current = '';
    setParsedResult(null);
    setIsAiParsing(false);
    setAutoApplyCountdown(null);
    setParseError(null);
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  }, []);

  // Handle countdown for hands-free auto-apply
  useEffect(() => {
    if (autoApplyCountdown === null) return;

    if (autoApplyCountdown <= 0) {
      if (parsedResult) {
        handleApply();
      }
      return;
    }

    countdownTimerRef.current = setTimeout(() => {
      setAutoApplyCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApplyCountdown, parsedResult]);

  const handleProcessTranscript = async (rawText: string) => {
    const cleanText = rawText.trim();
    if (!cleanText) return;

    // 1. High-speed local regex & phonetic parser
    const localResult = parseHinglishWorkoutVoice(cleanText, currentExerciseName, defaultUnit);

    if (localResult) {
      setParsedResult(localResult);
      setParseError(null);
      // Start 4-second auto-apply timer for sweaty-hands hands-free logging
      setAutoApplyCountdown(4);
      return;
    }

    // 2. Fallback to Gemini if text exists but local parser couldn't detect numbers
    if (cleanText.length > 2) {
      setIsAiParsing(true);
      setParseError(null);
      try {
        const res = await fetch('/api/ai/parse-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: cleanText,
            currentExercise: currentExerciseName,
            userUnit: defaultUnit,
          }),
        });

        const data = await res.json();
        if (data?.success && data?.result && data.result.reps > 0) {
          const r = data.result;
          const ex = r.exerciseName || currentExerciseName;
          const rpeLabel = r.rpe ? ` • RPE ${r.rpe}` : '';
          const summary = `${ex ? ex + ': ' : ''}${r.weight}${defaultUnit} × ${r.reps} reps${rpeLabel}`;

          const aiResult: VoiceWorkoutResult = {
            exerciseName: ex,
            weight: r.weight,
            reps: r.reps,
            rpe: r.rpe,
            setIndex: r.setIndex,
            confidence: 'high',
            rawTranscript: cleanText,
            summary,
          };
          setParsedResult(aiResult);
          setAutoApplyCountdown(4);
        } else {
          setParseError('Could not detect weight and reps. Say e.g. "80 pe 5" or "100 x 3"');
        }
      } catch {
        setParseError('Voice parsing error. Tap retry and speak clearly.');
      } finally {
        setIsAiParsing(false);
      }
    }
  };

  const startListening = useCallback(() => {
    resetState();
    if (!supported) return;

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognizer = createSpeechRecognizer({
        lang: speechLang,
        onResult: (text: string) => {
          setTranscript(text);
          latestTranscriptRef.current = text;
          setParseError(null);

          // LIVE PREVIEW: test parsing as words stream in
          const live = parseHinglishWorkoutVoice(text, currentExerciseName, defaultUnit);
          if (live) {
            setParsedResult(live);
          }

          // Debounce silence timer (1.4s after user pauses speaking)
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            stopListening();
            handleProcessTranscript(text);
          }, 1400);
        },
        onError: (err: string) => {
          console.warn('Speech recognition status:', err);
        },
        onEnd: () => {
          setIsListening(false);
          // If ended naturally and we have a transcript that hasn't been finalized yet
          if (latestTranscriptRef.current) {
            handleProcessTranscript(latestTranscriptRef.current);
          }
        },
      });

      if (recognizer) {
        recognitionRef.current = recognizer;
        recognizer.start();
        setIsListening(true);
      }
    } catch (err) {
      console.error('Failed to start speech recognizer:', err);
      setIsListening(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, speechLang, currentExerciseName, defaultUnit, resetState, stopListening]);

  // Start listening automatically on modal open
  useEffect(() => {
    if (!isOpen) {
      stopListening();
      resetState();
      return;
    }

    if (supported) {
      startListening();
    }

    return () => {
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, speechLang]);

  const handleApply = () => {
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    if (!parsedResult) return;
    onApplySet(parsedResult);
    toast.success(`Logged: ${parsedResult.summary}`, 'Set Completed');
    onClose();
  };

  // User touched manual adjustments -> cancel auto countdown so they are not rushed
  const cancelCountdown = () => {
    if (autoApplyCountdown !== null) {
      setAutoApplyCountdown(null);
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    }
  };

  const adjustWeight = (delta: number) => {
    cancelCountdown();
    if (!parsedResult) return;
    const newWeight = Math.max(0, Math.round((parsedResult.weight + delta) * 10) / 10);
    const exLabel = parsedResult.exerciseName ? `${parsedResult.exerciseName}: ` : '';
    const rpeLabel = parsedResult.rpe ? ` • RPE ${parsedResult.rpe}` : '';
    setParsedResult({
      ...parsedResult,
      weight: newWeight,
      summary: `${exLabel}${newWeight}${defaultUnit} × ${parsedResult.reps} reps${rpeLabel}`,
    });
  };

  const adjustReps = (delta: number) => {
    cancelCountdown();
    if (!parsedResult) return;
    const newReps = Math.max(1, parsedResult.reps + delta);
    const exLabel = parsedResult.exerciseName ? `${parsedResult.exerciseName}: ` : '';
    const rpeLabel = parsedResult.rpe ? ` • RPE ${parsedResult.rpe}` : '';
    setParsedResult({
      ...parsedResult,
      reps: newReps,
      summary: `${exLabel}${parsedResult.weight}${defaultUnit} × ${newReps} reps${rpeLabel}`,
    });
  };

  const setRpe = (rpeVal: number) => {
    cancelCountdown();
    if (!parsedResult) return;
    const exLabel = parsedResult.exerciseName ? `${parsedResult.exerciseName}: ` : '';
    setParsedResult({
      ...parsedResult,
      rpe: rpeVal,
      summary: `${exLabel}${parsedResult.weight}${defaultUnit} × ${parsedResult.reps} reps • RPE ${rpeVal}`,
    });
  };

  if (!isOpen) return null;

  const weightStep = defaultUnit === 'lbs' ? 5 : 2.5;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-sm w-full p-4 sm:p-5 space-y-3.5 text-center select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Language Selector */}
        <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
          <div className="flex items-center gap-2 text-left">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-text-primary leading-tight">
                Voice Log Set
              </h3>
              <p className="text-3xs text-text-muted font-mono truncate max-w-[140px]">
                {currentExerciseName || 'Active Workout'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Language toggle pill */}
            <button
              type="button"
              onClick={() => {
                const nextLang = speechLang === 'en-IN' ? 'hi-IN' : 'en-IN';
                setSpeechLang(nextLang);
              }}
              className="py-1 px-2 rounded-lg bg-bg-secondary border border-border/80 text-3xs font-mono font-bold text-text-secondary hover:text-accent hover:border-accent/40 flex items-center gap-1 transition-colors"
              title="Toggle speech recognition language"
            >
              <Globe className="w-2.5 h-2.5 text-accent" />
              <span>{speechLang === 'en-IN' ? 'Hinglish' : 'हिन्दी'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!supported ? (
          <div className="py-4 space-y-2 text-text-muted">
            <MicOff className="w-9 h-9 mx-auto text-rose-400" />
            <p className="text-xs font-mono font-semibold text-text-primary">
              Web Speech API not available
            </p>
            <p className="text-3xs font-mono text-text-secondary">
              Please use <strong>Google Chrome on Android</strong> for hands-free voice logging in the gym.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Pulsing Mic Button */}
            <div className="flex flex-col items-center justify-center pt-1">
              <button
                type="button"
                onClick={() => {
                  if (isListening) {
                    stopListening();
                    if (latestTranscriptRef.current) {
                      handleProcessTranscript(latestTranscriptRef.current);
                    }
                  } else {
                    startListening();
                  }
                }}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                  isListening
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 animate-pulse scale-105'
                    : 'bg-accent/20 text-accent hover:bg-accent/30 border-2 border-accent'
                }`}
                title={isListening ? 'Tap to finish speaking' : 'Tap to start voice input'}
              >
                {isListening ? (
                  <Mic className="w-8 h-8 animate-bounce" />
                ) : (
                  <Mic className="w-7 h-7" />
                )}
              </button>
              <span className="text-3xs font-mono font-bold mt-2 text-text-secondary uppercase tracking-wider">
                {isListening ? 'Listening... Speak now' : 'Tap mic to speak'}
              </span>
            </div>

            {/* Transcript Readout Box */}
            <div className="p-2.5 rounded-xl bg-bg-secondary border border-border/70 min-h-[52px] flex items-center justify-center text-center">
              {transcript ? (
                <p className="text-xs font-mono text-text-primary italic font-medium leading-snug">
                  &quot;{transcript}&quot;
                </p>
              ) : isListening ? (
                <p className="text-2xs font-mono text-text-muted animate-pulse">
                  Say: &quot;80 pe 5, RPE 8&quot; or &quot;100 x 3&quot;
                </p>
              ) : (
                <p className="text-2xs font-mono text-text-muted">
                  Ready. Tap mic and say weight and reps.
                </p>
              )}
            </div>

            {/* AI Parsing Spinner */}
            {isAiParsing && (
              <div className="flex items-center justify-center gap-1.5 text-accent text-2xs font-mono py-1">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>Interpreting gym slang with AI...</span>
              </div>
            )}

            {/* Parse Error Notification */}
            {parseError && !parsedResult && !isAiParsing && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-3xs font-mono text-left">
                {parseError}
              </div>
            )}

            {/* Recognized Set Card with Interactive Quick Adjust Steppers */}
            {parsedResult && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border-2 border-emerald-500/40 space-y-2.5 text-left animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-3xs font-mono font-black uppercase text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded tracking-wide">
                    RECOGNIZED SET
                  </span>
                  {autoApplyCountdown !== null && autoApplyCountdown > 0 ? (
                    <span className="text-3xs font-mono text-text-muted animate-pulse">
                      Auto-logging in <strong>{autoApplyCountdown}s</strong>...
                    </span>
                  ) : (
                    <span className="text-3xs font-mono text-text-muted">
                      Ready to apply
                    </span>
                  )}
                </div>

                {/* Target Exercise */}
                {parsedResult.exerciseName && (
                  <p className="text-2xs text-text-secondary font-mono truncate">
                    Target: <strong className="text-text-primary">{parsedResult.exerciseName}</strong>
                  </p>
                )}

                {/* Interactive Stepper Row for Weight & Reps */}
                <div className="grid grid-cols-2 gap-2 font-mono">
                  {/* Weight Stepper */}
                  <div className="p-2 rounded-lg bg-bg-card border border-border flex items-center justify-between">
                    <div>
                      <span className="text-3xs text-text-muted block uppercase">Weight</span>
                      <span className="text-sm font-black text-text-primary">
                        {parsedResult.weight} {defaultUnit}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => adjustWeight(-weightStep)}
                        className="w-6 h-6 rounded bg-bg-secondary hover:bg-border text-text-primary flex items-center justify-center active:scale-90"
                        title={`Decrease ${weightStep}${defaultUnit}`}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustWeight(weightStep)}
                        className="w-6 h-6 rounded bg-bg-secondary hover:bg-border text-text-primary flex items-center justify-center active:scale-90"
                        title={`Increase ${weightStep}${defaultUnit}`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Reps Stepper */}
                  <div className="p-2 rounded-lg bg-bg-card border border-border flex items-center justify-between">
                    <div>
                      <span className="text-3xs text-text-muted block uppercase">Reps</span>
                      <span className="text-sm font-black text-text-primary">
                        {parsedResult.reps}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => adjustReps(-1)}
                        className="w-6 h-6 rounded bg-bg-secondary hover:bg-border text-text-primary flex items-center justify-center active:scale-90"
                        title="Decrease 1 rep"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustReps(1)}
                        className="w-6 h-6 rounded bg-bg-secondary hover:bg-border text-text-primary flex items-center justify-center active:scale-90"
                        title="Increase 1 rep"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick RPE Pills */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-3xs font-mono text-text-muted">
                    <span className="flex items-center gap-1">
                      <SlidersHorizontal className="w-2.5 h-2.5" />
                      <span>RPE (Effort Rating):</span>
                    </span>
                    <span className="font-bold text-accent">
                      {parsedResult.rpe ? `@ RPE ${parsedResult.rpe}` : 'Optional'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    {[7, 7.5, 8, 8.5, 9, 9.5, 10].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setRpe(val)}
                        className={`flex-1 py-1 rounded text-3xs font-mono font-bold transition-all ${
                          parsedResult.rpe === val
                            ? 'bg-accent text-white shadow-xs'
                            : 'bg-bg-card hover:bg-bg-secondary border border-border/70 text-text-secondary'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleApply}
                    className="btn-primary py-2 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Check className="w-4 h-4" />
                    <span>Apply Set</span>
                  </button>
                  <button
                    type="button"
                    onClick={startListening}
                    className="btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry Voice</span>
                  </button>
                </div>
              </div>
            )}

            {/* Quick Example Chips */}
            <div className="pt-1 text-left">
              <span className="text-3xs uppercase font-mono text-text-muted block mb-1">
                Voice Examples (Tap to test):
              </span>
              <div className="flex flex-wrap gap-1">
                {[
                  '80 pe 5, RPE 8',
                  'bench 100 x 3',
                  'squat 140 kilo 3 rep',
                  '12.5 pe 10',
                  'assi pe paanch',
                  'bodyweight 10 reps',
                ].map((eg, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setTranscript(eg);
                      handleProcessTranscript(eg);
                    }}
                    className="text-3xs font-mono px-2 py-0.5 rounded bg-bg-secondary border border-border/60 text-text-secondary hover:text-accent hover:border-accent/40 transition-colors"
                  >
                    &quot;{eg}&quot;
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
