"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  parseHinglishWorkoutVoice,
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  VoiceWorkoutResult,
} from '@/lib/voice-logger';
import { Mic, MicOff, X, Check, RotateCcw, Sparkles, Volume2 } from 'lucide-react';
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
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const supported = isSpeechRecognitionSupported();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Handle countdown for auto-apply
  useEffect(() => {
    if (autoApplyCountdown === null) return;

    if (autoApplyCountdown <= 0) {
      if (parsedResult) {
        handleApply();
      }
      return;
    }

    timerRef.current = setTimeout(() => {
      setAutoApplyCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApplyCountdown, parsedResult]);

  const resetState = () => {
    setTranscript('');
    setParsedResult(null);
    setIsAiParsing(false);
    setAutoApplyCountdown(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const startListening = () => {
    resetState();

    if (!supported) return;

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognizer = createSpeechRecognizer({
        onResult: (text, isFinal) => {
          setTranscript(text);
          if (isFinal) {
            handleProcessTranscript(text);
          }
        },
        onError: (err) => {
          console.warn('Speech recognition error:', err);
          setIsListening(false);
        },
        onEnd: () => {
          setIsListening(false);
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
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
  };

  const handleProcessTranscript = async (rawText: string) => {
    stopListening();

    // 1. Try instant offline regex parser
    const localResult = parseHinglishWorkoutVoice(rawText, currentExerciseName, defaultUnit);

    if (localResult) {
      setParsedResult(localResult);
      // Start 3-second auto-apply timer for sweaty-hands hands-free logging
      setAutoApplyCountdown(3);
      return;
    }

    // 2. Fallback to Gemini if text exists but regex missed complex phrasing
    if (rawText.trim().length > 3) {
      setIsAiParsing(true);
      try {
        const res = await fetch('/api/ai/parse-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: rawText,
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
            rawTranscript: rawText,
            summary,
          };
          setParsedResult(aiResult);
          setAutoApplyCountdown(3);
        } else {
          toast.error('Could not understand weight and reps. Please try again.', 'Try Again');
        }
      } catch {
        toast.error('Voice parsing failed. Speak clearly e.g. "80 pe 5"', 'Parsing Failed');
      } finally {
        setIsAiParsing(false);
      }
    }
  };

  const handleApply = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!parsedResult) return;
    onApplySet(parsedResult);
    toast.success(`Logged: ${parsedResult.summary}`, 'Set Logged');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-sm w-full p-5 space-y-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2 text-left">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-text-primary leading-tight">
                Voice Log Set
              </h3>
              <p className="text-2xs text-text-muted font-mono">Hinglish / English Hands-Free</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!supported ? (
          <div className="py-4 space-y-2 text-text-muted">
            <MicOff className="w-10 h-10 mx-auto text-rose-400" />
            <p className="text-xs font-mono">
              Speech recognition is not supported in this browser.
            </p>
            <p className="text-3xs font-mono text-text-secondary">
              Please use <strong>Google Chrome on Android</strong> or desktop Chrome for hands-free voice logging.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Mic Animation Button */}
            <div className="flex flex-col items-center justify-center">
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  isListening
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 animate-pulse scale-105'
                    : 'bg-accent/20 text-accent hover:bg-accent/30 border-2 border-accent'
                }`}
                title={isListening ? 'Tap to finish' : 'Tap to start speaking'}
              >
                {isListening ? (
                  <Mic className="w-9 h-9 animate-bounce" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </button>
              <span className="text-2xs font-mono font-bold mt-2 text-text-secondary uppercase tracking-wider">
                {isListening ? 'Listening... Speak now' : 'Tap mic to speak'}
              </span>
            </div>

            {/* Transcript Readout */}
            <div className="p-3 rounded-xl bg-bg-secondary border border-border/70 min-h-[60px] flex items-center justify-center">
              {transcript ? (
                <p className="text-xs font-mono text-text-primary italic font-medium">
                  &quot;{transcript}&quot;
                </p>
              ) : isListening ? (
                <p className="text-2xs font-mono text-text-muted animate-pulse">
                  Say: &quot;80 pe 5, RPE 8&quot; or &quot;bench 100 pe 3&quot;
                </p>
              ) : (
                <p className="text-2xs font-mono text-text-muted">
                  Ready. Tap mic and say your set weight and reps.
                </p>
              )}
            </div>

            {/* AI Parsing Indicator */}
            {isAiParsing && (
              <div className="flex items-center justify-center gap-1.5 text-accent text-2xs font-mono">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>Interpreting gym voice command...</span>
              </div>
            )}

            {/* Parsed Result Card */}
            {parsedResult && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border-2 border-emerald-500/40 space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-3xs font-mono font-bold uppercase text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                    RECOGNIZED SET
                  </span>
                  {autoApplyCountdown !== null && autoApplyCountdown > 0 && (
                    <span className="text-3xs font-mono text-text-muted">
                      Auto-applying in {autoApplyCountdown}s...
                    </span>
                  )}
                </div>

                <div className="flex items-baseline justify-between font-mono">
                  <div className="text-base font-black text-text-primary">
                    {parsedResult.weight} {defaultUnit} × {parsedResult.reps} reps
                  </div>
                  {parsedResult.rpe && (
                    <span className="text-xs font-bold text-accent">
                      RPE {parsedResult.rpe}
                    </span>
                  )}
                </div>

                {parsedResult.exerciseName && (
                  <p className="text-2xs text-text-secondary font-mono truncate">
                    Target: <strong className="text-text-primary">{parsedResult.exerciseName}</strong>
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleApply}
                    className="btn-primary py-2 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Check className="w-4 h-4" />
                    <span>Apply Now</span>
                  </button>
                  <button
                    type="button"
                    onClick={startListening}
                    className="btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                </div>
              </div>
            )}

            {/* Example Prompt Chips */}
            <div className="pt-1 text-left">
              <span className="text-3xs uppercase font-mono text-text-muted block mb-1">
                Voice Examples (Hindi / English):
              </span>
              <div className="flex flex-wrap gap-1">
                {[
                  '80 pe 5, RPE 8',
                  'bench 100 x 3',
                  'squat 140 kilo 3 rep',
                  '120 pe single',
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
