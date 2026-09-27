"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { getExerciseList, calculateOneRepMax } from '@/lib/strength-standards';
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  Trash2,
  ArrowLeft,
  Timer,
  Play,
  Pause,
  RotateCcw,
  Dumbbell,
  Sparkles
} from 'lucide-react';
import { WorkoutEntry, WorkoutExercise, WorkoutSet } from '@/lib/store';
import ThemeToggle from '@/components/ui/ThemeToggle';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import { useToast } from '@/components/ui/Toast';

interface WorkoutPageProps {
  onNavigate?: (tab: 'home' | 'prs' | 'workout' | 'meals') => void;
}

export default function WorkoutPage({ onNavigate }: WorkoutPageProps = {}) {
  const profile = useStore((state) => state.profile);
  const prs = useStore((state) => state.prs);
  const workouts = useStore((state) => state.workouts);
  const addWorkout = useStore((state) => state.addWorkout);
  const deleteWorkout = useStore((state) => state.deleteWorkout);
  const addPR = useStore((state) => state.addPR);
  const toast = useToast();
  
  const userUnit = profile?.unit || 'kg';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlateModalOpen, setIsPlateModalOpen] = useState(false);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());

  // Rest Timer State
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(90);
  const [isRestRunning, setIsRestRunning] = useState<boolean>(false);
  const [isRestExpanded, setIsRestExpanded] = useState<boolean>(false);
  
  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  
  const availableExercises = getExerciseList();
  
  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedWorkouts);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedWorkouts(newExpanded);
  };
  
  const handleAddExercise = () => {
    setExercises([...exercises, { name: '', sets: [{ reps: 8, weight: 0, unit: userUnit }] }]);
  };
  
  const handleRemoveExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };
  
  const handleExerciseNameChange = (index: number, name: string) => {
    const newExercises = [...exercises];
    newExercises[index].name = name;
    setExercises(newExercises);
  };
  
  const handleAddSet = (exerciseIndex: number) => {
    const newExercises = [...exercises];
    const prevSet = newExercises[exerciseIndex].sets[newExercises[exerciseIndex].sets.length - 1];
    newExercises[exerciseIndex].sets.push({
      reps: prevSet ? prevSet.reps : 8,
      weight: prevSet ? prevSet.weight : 0,
      unit: prevSet ? prevSet.unit : userUnit
    });
    setExercises(newExercises);
  };
  
  const handleRemoveSet = (exerciseIndex: number, setIndex: number) => {
    const newExercises = [...exercises];
    newExercises[exerciseIndex].sets = newExercises[exerciseIndex].sets.filter((_, i) => i !== setIndex);
    setExercises(newExercises);
  };
  
  const handleSetChange = (exerciseIndex: number, setIndex: number, field: keyof WorkoutSet, value: any) => {
    const newExercises = [...exercises];
    newExercises[exerciseIndex].sets[setIndex] = {
      ...newExercises[exerciseIndex].sets[setIndex],
      [field]: value,
    };
    setExercises(newExercises);
  };
  
  // Audio Beep for Rest Timer completion
  const playBeep = () => {
    try {
      if (typeof window === 'undefined') return;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch {}
  };

  // Rest Timer Countdown Effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRestRunning && restSecondsLeft > 0) {
      interval = setInterval(() => {
        setRestSecondsLeft((prev) => {
          if (prev <= 1) {
            playBeep();
            toast.info('⏰ Rest time is up! Ready for your next set.', 'Rest Period Complete');
            setIsRestRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRestRunning, restSecondsLeft, toast]);

  const startTimer = (seconds: number) => {
    setRestTotalSeconds(seconds);
    setRestSecondsLeft(seconds);
    setIsRestRunning(true);
    setIsRestExpanded(true);
  };

  const togglePauseTimer = () => {
    setIsRestRunning(!isRestRunning);
  };

  const resetTimer = () => {
    setIsRestRunning(false);
    setRestSecondsLeft(restTotalSeconds);
  };

  const adjustTimer = (deltaSeconds: number) => {
    setRestSecondsLeft((prev) => Math.max(0, prev + deltaSeconds));
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  };

  const handleSaveWorkout = () => {
    const validExercises = exercises.filter(e => e.name.trim() && e.sets.length > 0);
    if (validExercises.length === 0) {
      toast.error('Please add at least one exercise with sets.', 'Empty Workout');
      return;
    }
    
    const workoutId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `w_${Date.now()}`;
    const newWorkout: WorkoutEntry = {
      id: workoutId,
      date,
      exercises: validExercises
    };
    
    addWorkout(newWorkout);

    // Auto-PR Detection across all exercises in this workout
    let newPRCount = 0;
    for (const ex of validExercises) {
      const exName = ex.name.trim();
      const existingPRs = prs.filter(p => p.exercise.toLowerCase() === exName.toLowerCase());
      const currentBest1RMKg = existingPRs.length > 0 ? Math.max(...existingPRs.map(p => p.oneRepMax)) : 0;

      let topSetInWorkout = { weightKg: 0, weightLbs: 0, reps: 0, e1RMKg: 0, rawWeight: 0, unit: userUnit };

      for (const s of ex.sets) {
        const wNum = s.weight;
        const rNum = s.reps;
        if (wNum > 0 && rNum > 0) {
          const wKg = s.unit === 'lbs' ? wNum * 0.453592 : wNum;
          const wLbs = s.unit === 'lbs' ? wNum : wNum * 2.20462;
          const e1RM = calculateOneRepMax(wKg, rNum);
          if (e1RM > topSetInWorkout.e1RMKg) {
            topSetInWorkout = {
              weightKg: Math.round(wKg * 10) / 10,
              weightLbs: Math.round(wLbs * 10) / 10,
              reps: rNum,
              e1RMKg: Math.round(e1RM * 10) / 10,
              rawWeight: wNum,
              unit: s.unit
            };
          }
        }
      }

      if (topSetInWorkout.e1RMKg > currentBest1RMKg && topSetInWorkout.e1RMKg > 0) {
        const prId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pr_${Date.now()}_${Math.random()}`;
        addPR({
          id: prId,
          exercise: exName,
          weightKg: topSetInWorkout.weightKg,
          weightLbs: topSetInWorkout.weightLbs,
          reps: topSetInWorkout.reps,
          oneRepMax: topSetInWorkout.e1RMKg,
          date,
          notes: 'Auto-detected from workout session'
        });
        newPRCount++;
      }
    }

    if (newPRCount > 0) {
      toast.success(
        `🎉 ${newPRCount} New Personal Record${newPRCount > 1 ? 's' : ''} detected & synced to your PRs!`,
        'New PR Milestone'
      );
    } else {
      toast.success(
        `Logged workout with ${validExercises.length} exercise${validExercises.length > 1 ? 's' : ''}!`,
        'Workout Saved'
      );
    }

    setIsModalOpen(false);
    setDate(new Date().toISOString().split('T')[0]);
    setExercises([]);
  };
  
  const sortedWorkouts = useMemo(() => {
    return [...workouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20);
  }, [workouts]);
  
  return (
    <div className="page animate-fade-in space-y-4">
      <header className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2.5">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="w-8 h-8 rounded-lg bg-bg-card border border-border flex items-center justify-center text-accent hover:border-accent transition-colors active:scale-95"
              title="Return to Home Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">Workouts</h1>
            <p className="text-2xs text-text-muted font-mono">Log your sessions &amp; track consistency</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlateModalOpen(true)}
            className="p-2 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
            title="Plate Calculator & Warmup Ramp"
          >
            <Dumbbell className="w-4 h-4 text-accent" />
          </button>
          <ThemeToggle />
          <button className="btn-primary flex items-center gap-1.5" onClick={() => {
            if (exercises.length === 0) handleAddExercise();
            setIsModalOpen(true);
          }}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Log Workout</span>
            <span className="sm:hidden">Log</span>
          </button>
        </div>
      </header>

      {/* Rest Interval Timer Widget */}
      <section className="card p-3.5 bg-gradient-to-r from-bg-card via-bg-secondary to-bg-card border border-border/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Timer className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-text-primary font-mono block">
                REST INTERVAL TIMER
              </span>
              <span className="text-[10px] text-text-muted font-mono">
                {isRestRunning ? 'Rest in progress...' : 'Pace your sets & recovery'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-mono">
            {restSecondsLeft > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-accent">
                  {formatTimer(restSecondsLeft)}
                </span>
                <button
                  type="button"
                  onClick={togglePauseTimer}
                  className="p-1 rounded bg-bg-elevated hover:bg-bg-secondary text-text-primary transition-colors"
                  title={isRestRunning ? 'Pause' : 'Resume'}
                >
                  {isRestRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={resetTimer}
                  className="p-1 rounded bg-bg-elevated hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors"
                  title="Reset timer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <span className="text-2xs text-text-muted">Tap interval:</span>
            )}
          </div>
        </div>

        {/* Preset Chips */}
        <div className="flex items-center gap-1.5 pt-2.5 overflow-x-auto scrollbar-none font-mono">
          {[60, 90, 120, 180].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => startTimer(s)}
              className={`flex-1 py-1 px-2 rounded-lg text-2xs font-semibold border transition-colors ${
                restTotalSeconds === s && restSecondsLeft > 0
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'bg-bg-elevated border-border text-text-secondary hover:text-text-primary hover:border-accent/40'
              }`}
            >
              {s >= 60 ? `${s / 60}m` : `${s}s`}
            </button>
          ))}
          {restSecondsLeft > 0 && (
            <div className="flex gap-1 ml-1">
              <button
                type="button"
                onClick={() => adjustTimer(-15)}
                className="py-1 px-1.5 rounded-lg text-2xs bg-bg-secondary border border-border text-text-muted hover:text-text-primary"
                title="-15 seconds"
              >
                -15s
              </button>
              <button
                type="button"
                onClick={() => adjustTimer(15)}
                className="py-1 px-1.5 rounded-lg text-2xs bg-bg-secondary border border-border text-accent hover:border-accent"
                title="+15 seconds"
              >
                +15s
              </button>
            </div>
          )}
        </div>

        {/* Live Progress Bar */}
        {restSecondsLeft > 0 && restTotalSeconds > 0 && (
          <div className="mt-2.5">
            <div className="level-bar">
              <div
                className="level-bar-fill bg-accent"
                style={{
                  width: `${Math.min(100, Math.max(0, (restSecondsLeft / restTotalSeconds) * 100))}%`,
                  transition: 'width 1s linear',
                }}
              />
            </div>
          </div>
        )}
      </section>

      <section>
        {sortedWorkouts.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-text-secondary">No workouts logged yet.</p>
            <p className="text-xs text-text-muted mt-1">Tap &quot;Log Workout&quot; to record what you trained today.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sortedWorkouts.map(workout => {
              const isExpanded = expandedWorkouts.has(workout.id);
              const totalSets = workout.exercises.reduce((sum, e) => sum + e.sets.length, 0);
              
              return (
                <div key={workout.id} className="card">
                  <div 
                    className="flex justify-between items-center cursor-pointer"
                    onClick={() => toggleExpand(workout.id)}
                  >
                    <div>
                      <h3 className="font-semibold text-text-primary">{new Date(workout.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</h3>
                      <p className="text-xs text-text-secondary mt-0.5">{workout.exercises.length} exercises • {totalSets} sets</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-text-secondary" /> : <ChevronDown className="w-5 h-5 text-text-secondary" />}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
                      {workout.exercises.map((ex, i) => (
                        <div key={i} className="bg-bg-elevated p-3 rounded-lg">
                          <p className="font-medium text-accent mb-2 text-sm">{ex.name}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-text-secondary">
                            {ex.sets.map((set, j) => (
                              <div key={j} className="bg-bg-primary px-2.5 py-1.5 rounded border border-border">
                                Set {j + 1}: <span className="text-text-primary font-medium">{set.weight} {set.unit}</span> × {set.reps} reps
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      
                      <div className="flex justify-end pt-2">
                        <button 
                          onClick={() => {
                            deleteWorkout(workout.id);
                            toast.info(`Deleted workout session from ${workout.date}.`, 'Workout Removed');
                          }}
                          className="text-danger hover:text-danger/80 text-xs flex items-center gap-1.5 px-2 py-1 rounded hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Workout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold text-text-primary">Log Workout</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-text-secondary hover:text-text-primary p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-5">
              <div>
                <label className="section-title mb-2 block">Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-bg-elevated border border-border rounded-lg p-2.5 text-text-primary pl-10 focus:border-accent outline-none text-sm"
                  />
                  <Calendar className="w-4 h-4 text-text-secondary absolute left-3 top-3.5" />
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="section-title">Exercises</label>
                  <button 
                    onClick={handleAddExercise}
                    className="text-accent text-xs font-semibold flex items-center gap-1 hover:brightness-110"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Exercise
                  </button>
                </div>
                
                <div className="flex flex-col gap-4">
                  {exercises.map((exercise, i) => (
                    <div key={i} className="border border-border rounded-xl p-3.5 bg-bg-elevated/40 relative">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-accent font-semibold">EXERCISE {i + 1}</span>
                        <button 
                          onClick={() => handleRemoveExercise(i)}
                          className="text-text-muted hover:text-danger p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <input
                        type="text"
                        placeholder="Exercise Name (e.g. Bench Press)"
                        value={exercise.name}
                        onChange={(e) => handleExerciseNameChange(i, e.target.value)}
                        list="exercises-list"
                        className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-text-primary mb-3 text-sm focus:border-accent outline-none"
                      />
                      
                      <div className="flex flex-col gap-2">
                        {exercise.sets.map((set, j) => (
                          <div key={j} className="flex gap-2 items-center">
                            <span className="text-text-muted text-xs w-10 font-mono">S{j + 1}</span>
                            <input
                              type="number"
                              placeholder="Weight"
                              value={set.weight || ''}
                              onChange={(e) => handleSetChange(i, j, 'weight', Number(e.target.value))}
                              className="w-full bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-sm outline-none focus:border-accent"
                            />
                            <select
                              value={set.unit}
                              onChange={(e) => handleSetChange(i, j, 'unit', e.target.value)}
                              className="bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-xs outline-none focus:border-accent"
                            >
                              <option value="kg">kg</option>
                              <option value="lbs">lbs</option>
                            </select>
                            <span className="text-text-muted text-xs">×</span>
                            <input
                              type="number"
                              placeholder="Reps"
                              value={set.reps || ''}
                              onChange={(e) => handleSetChange(i, j, 'reps', Number(e.target.value))}
                              className="w-full bg-bg-elevated border border-border rounded-lg p-1.5 text-text-primary text-sm outline-none focus:border-accent"
                            />
                            <button onClick={() => handleRemoveSet(i, j)} className="text-text-muted hover:text-danger p-1">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      
                      <button 
                        onClick={() => handleAddSet(i)}
                        className="btn-ghost text-xs mt-2.5 w-full flex items-center justify-center gap-1 py-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Set
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-border flex gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveWorkout}
                disabled={exercises.length === 0 || !exercises.some(e => e.name.trim())}
                className="btn-primary flex-1 disabled:opacity-40"
              >
                Save Workout
              </button>
            </div>
          </div>
        </div>
      )}
      
      <datalist id="exercises-list">
        {availableExercises.map(ex => <option key={ex} value={ex} />)}
      </datalist>

      {/* Barbell Plate Loading & Warmup Sets Calculator Modal */}
      <PlateCalculatorModal
        isOpen={isPlateModalOpen}
        onClose={() => setIsPlateModalOpen(false)}
        initialUnit={userUnit}
        initialWeight={userUnit === 'kg' ? 100 : 225}
      />
    </div>
  );
}
