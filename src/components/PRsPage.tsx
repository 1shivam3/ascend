'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import {
  getLiftLevel,
  getOverallLevel,
  getExerciseList,
  calculateOneRepMax,
  getNextMilestone
} from '@/lib/strength-standards';
import { Plus, Trash2, X, Target, Edit3, ChevronDown, ChevronUp } from 'lucide-react';
import RankBadge from '@/components/ui/RankBadge';
import ProgressChart from '@/components/ProgressChart';
import ThemeToggle from '@/components/ui/ThemeToggle';

export default function PRsPage() {
  const { profile, prs, workouts, prTargets, addPR, deletePR, setPRTarget } = useStore();
  const userUnit = profile?.unit || 'kg';

  const [showAddModal, setShowAddModal] = useState(false);
  const [targetModalExercise, setTargetModalExercise] = useState<string | null>(null);
  const [targetWeightInput, setTargetWeightInput] = useState('');
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);

  // Form State
  const [exercise, setExercise] = useState('');
  const [customExercise, setCustomExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lbs'>(userUnit);
  const [reps, setReps] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const availableExercises = getExerciseList();

  const handleSavePR = () => {
    const finalExercise = exercise === 'Custom' ? customExercise.trim() : exercise;
    if (!finalExercise || !weight || !reps || !date) return;

    const weightNum = parseFloat(weight);
    const repsNum = parseInt(reps, 10);
    if (isNaN(weightNum) || isNaN(repsNum) || weightNum <= 0 || repsNum <= 0) return;

    let weightKg = 0;
    let weightLbs = 0;

    if (unit === 'lbs') {
      weightLbs = weightNum;
      weightKg = weightNum * 0.453592;
    } else {
      weightKg = weightNum;
      weightLbs = weightNum * 2.20462;
    }

    const oneRepMaxKg = calculateOneRepMax(weightKg, repsNum);

    addPR({
      id: crypto.randomUUID(),
      exercise: finalExercise,
      weightKg: Math.round(weightKg * 10) / 10,
      weightLbs: Math.round(weightLbs * 10) / 10,
      reps: repsNum,
      oneRepMax: Math.round(oneRepMaxKg * 10) / 10,
      date,
      notes: notes.trim() || undefined
    });

    setShowAddModal(false);
    setExercise('');
    setCustomExercise('');
    setWeight('');
    setReps('1');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const handleSaveTarget = () => {
    if (!targetModalExercise || !targetWeightInput) return;
    const targetVal = parseFloat(targetWeightInput);
    if (!isNaN(targetVal) && targetVal > 0) {
      // Store target in kg internally for consistent comparisons
      const targetKg = userUnit === 'lbs' ? targetVal * 0.453592 : targetVal;
      setPRTarget(targetModalExercise, Math.round(targetKg * 10) / 10);
    }
    setTargetModalExercise(null);
    setTargetWeightInput('');
  };

  // Group PRs by exercise and compute rich statistics
  const exerciseStats = useMemo(() => {
    const groups = new Map<
      string,
      {
        exercise: string;
        prs: typeof prs;
        bestPR: (typeof prs)[0];
        best1RMKg: number;
        bestSet: { weight: number; reps: number; unit: string };
        levelInfo: ReturnType<typeof getLiftLevel>;
        sessionsCount: number;
        nextMilestone: number;
        milestoneProgress: number;
      }
    >();

    prs.forEach((pr) => {
      const ex = pr.exercise;
      if (!groups.has(ex)) {
        groups.set(ex, {
          exercise: ex,
          prs: [],
          bestPR: pr,
          best1RMKg: 0,
          bestSet: { weight: 0, reps: 0, unit: userUnit },
          levelInfo: null as any,
          sessionsCount: 0,
          nextMilestone: 0,
          milestoneProgress: 0
        });
      }

      const g = groups.get(ex)!;
      g.prs.push(pr);

      const pr1RMKg = calculateOneRepMax(pr.weightKg, pr.reps);
      if (pr1RMKg > g.best1RMKg) {
        g.best1RMKg = pr1RMKg;
        g.bestPR = pr;
        const dispW = userUnit === 'lbs' ? pr.weightLbs : pr.weightKg;
        g.bestSet = { weight: dispW, reps: pr.reps, unit: userUnit };
      }
    });

    // Compute sessions from workouts
    groups.forEach((g, ex) => {
      g.prs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Sessions count from logged workouts
      g.sessionsCount = workouts.filter((w) =>
        w.exercises.some((e) => e.name.toLowerCase() === ex.toLowerCase())
      ).length;

      // Calculate calibrated lift level
      g.levelInfo = getLiftLevel(
        ex,
        g.best1RMKg,
        profile?.bodyweightKg || 75,
        profile?.gender || 'male'
      );

      // Next milestone calculation
      const best1RMUserUnit = userUnit === 'lbs' ? g.best1RMKg * 2.20462 : g.best1RMKg;
      const customTargetKg = prTargets?.[ex];
      const customTargetUserUnit = customTargetKg
        ? userUnit === 'lbs'
          ? customTargetKg * 2.20462
          : customTargetKg
        : undefined;

      const milestone = getNextMilestone(best1RMUserUnit, customTargetUserUnit);
      g.nextMilestone = Math.round(milestone * 10) / 10;

      // Progress towards milestone
      if (g.nextMilestone > 0) {
        g.milestoneProgress = Math.min(100, Math.max(0, Math.round((best1RMUserUnit / g.nextMilestone) * 100)));
      }
    });

    return Array.from(groups.values()).sort(
      (a, b) => (b.levelInfo?.level || 0) - (a.levelInfo?.level || 0)
    );
  }, [prs, workouts, profile, prTargets, userUnit]);

  // Overall strength level calculation
  const overallLevel = useMemo(() => {
    const levels = exerciseStats.map((e) => e.levelInfo).filter(Boolean);
    if (levels.length > 0) {
      return getOverallLevel(levels);
    }
    return null;
  }, [exerciseStats]);

  return (
    <div className="page animate-fade-in space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Personal Records</h1>
          <p className="text-xs text-text-muted mt-0.5">Ranked by real bodyweight standards</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            className="btn-primary flex items-center gap-1.5"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} />
            <span>Add PR</span>
          </button>
        </div>
      </div>

      {/* Overall Level Summary Card */}
      {overallLevel && (
        <div className="card space-y-3 bg-gradient-to-br from-bg-card to-bg-secondary border border-border">
          <div className="flex justify-between items-start">
            <div>
              <span className="section-title">OVERALL STRENGTH</span>
              <div className="flex items-baseline gap-2.5 mt-1">
                <span className="text-3xl font-extrabold text-accent font-mono">
                  LV.{overallLevel.level}
                </span>
                <span className="text-base font-bold text-text-primary tracking-wide font-mono">
                  {overallLevel.title}
                </span>
              </div>
            </div>
            <RankBadge rank={overallLevel.level <= 15 ? 'FOUNDATION' : overallLevel.level <= 30 ? 'TRAINED' : overallLevel.level <= 45 ? 'SKILLED' : overallLevel.level <= 65 ? 'ADVANCED' : overallLevel.level <= 80 ? 'ELITE' : overallLevel.level <= 95 ? 'MASTER' : 'GRANDMASTER'} size="sm" />
          </div>

          <div className="level-bar">
            <div
              className="level-bar-fill"
              style={{ width: `${Math.min(100, Math.max(2, overallLevel.level))}%` }}
            />
          </div>

          <div className="flex justify-between text-2xs text-text-muted font-mono">
            <span>{exerciseStats.length} Lifts Ranked</span>
            <span>Strength Ratio: {overallLevel.averageRatio}x BW</span>
          </div>
        </div>
      )}

      {/* Progress Chart */}
      <ProgressChart />

      {/* Lift Cards List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">YOUR LIFTS & MILESTONES</h2>
          <span className="text-2xs text-text-muted font-mono">{exerciseStats.length} Tracked</span>
        </div>

        {exerciseStats.length === 0 ? (
          <div className="card text-center py-12">
            <Target className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
            <p className="text-text-secondary text-sm">No personal records logged yet.</p>
            <p className="text-xs text-text-muted mt-1">
              Tap &quot;Add PR&quot; above to calibrate your first lift and discover your rank.
            </p>
          </div>
        ) : (
          exerciseStats.map((item) => {
            const isExpanded = expandedExercise === item.exercise;
            const display1RM =
              userUnit === 'lbs'
                ? Math.round(item.best1RMKg * 2.20462 * 10) / 10
                : Math.round(item.best1RMKg * 10) / 10;

            return (
              <div
                key={item.exercise}
                className="card space-y-4 transition-all duration-150 hover:border-border-hover"
              >
                {/* Header: Name, Level, Rank */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-text-primary capitalize">
                      {item.exercise}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono font-semibold text-accent">
                        LEVEL {item.levelInfo.level}
                      </span>
                    </div>
                  </div>
                  <RankBadge rank={item.levelInfo.rank} size="md" />
                </div>

                {/* Metrics Grid as requested */}
                <div className="grid grid-cols-4 gap-2 py-3 px-3 rounded-lg bg-bg-secondary/70 border border-border/60 text-center font-mono">
                  <div>
                    <span className="text-2xs text-text-muted block uppercase">e1RM</span>
                    <span className="text-sm font-bold text-accent">
                      {display1RM} {userUnit}
                    </span>
                  </div>
                  <div className="border-l border-border/60">
                    <span className="text-2xs text-text-muted block uppercase">Best Set</span>
                    <span className="text-xs font-semibold text-text-primary">
                      {item.bestSet.weight} × {item.bestSet.reps}
                    </span>
                  </div>
                  <div className="border-l border-border/60">
                    <span className="text-2xs text-text-muted block uppercase">PRs</span>
                    <span className="text-sm font-semibold text-text-secondary">
                      {item.prs.length}
                    </span>
                  </div>
                  <div className="border-l border-border/60">
                    <span className="text-2xs text-text-muted block uppercase">Sessions</span>
                    <span className="text-sm font-semibold text-text-secondary">
                      {item.sessionsCount}
                    </span>
                  </div>
                </div>

                {/* Next Milestone Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-text-muted flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-accent" /> Next Milestone
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-text-primary">
                        {item.nextMilestone} {userUnit}
                      </span>
                      <button
                        onClick={() => {
                          setTargetModalExercise(item.exercise);
                          setTargetWeightInput(item.nextMilestone.toString());
                        }}
                        className="text-text-muted hover:text-accent p-0.5 rounded transition-colors"
                        title="Edit Target PR"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="level-bar">
                    <div
                      className="level-bar-fill"
                      style={{ width: `${item.milestoneProgress}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-2xs text-text-muted font-mono">
                    <span>
                      {Math.max(0, Math.round((item.nextMilestone - display1RM) * 10) / 10)} {userUnit} to reach milestone
                    </span>
                    <span>{item.milestoneProgress}%</span>
                  </div>
                </div>

                {/* Expand / View History Toggle */}
                <div className="border-t border-border pt-2">
                  <button
                    onClick={() =>
                      setExpandedExercise(isExpanded ? null : item.exercise)
                    }
                    className="w-full flex items-center justify-between text-xs text-text-secondary hover:text-text-primary font-mono py-1"
                  >
                    <span>PR History ({item.prs.length})</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 animate-fade-in">
                      {item.prs.map((p) => {
                        const w = userUnit === 'lbs' ? p.weightLbs : p.weightKg;
                        const single1RM = calculateOneRepMax(w, p.reps);
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-bg-secondary border border-border text-xs font-mono"
                          >
                            <div>
                              <span className="font-bold text-text-primary">
                                {w} {userUnit} × {p.reps} reps
                              </span>
                              <div className="text-2xs text-text-muted flex gap-2 mt-0.5">
                                <span>e1RM: {Math.round(single1RM * 10) / 10} {userUnit}</span>
                                <span>•</span>
                                <span>{new Date(p.date).toLocaleDateString()}</span>
                              </div>
                              {p.notes && (
                                <p className="text-2xs text-text-secondary italic mt-0.5">
                                  &quot;{p.notes}&quot;
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => deletePR(p.id)}
                              className="text-text-muted hover:text-danger p-1 rounded hover:bg-danger/10 transition-colors"
                              title="Delete record"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Target Milestone Modal */}
      {targetModalExercise && (
        <div className="modal-overlay" onClick={() => setTargetModalExercise(null)}>
          <div className="modal-content p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="font-bold text-text-primary text-base">
                Set Target Milestone
              </h3>
              <button onClick={() => setTargetModalExercise(null)} className="text-text-muted p-1">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-text-secondary">
              Set your next target 1RM for <span className="text-accent font-semibold">{targetModalExercise}</span>.
            </p>

            <div className="flex gap-2">
              <input
                type="number"
                step="0.5"
                value={targetWeightInput}
                onChange={(e) => setTargetWeightInput(e.target.value)}
                placeholder="Target Weight"
                className="w-full text-base"
                autoFocus
              />
              <span className="flex items-center px-4 rounded-lg bg-bg-secondary border border-border font-mono text-sm text-text-muted">
                {userUnit}
              </span>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setTargetModalExercise(null)}
                className="btn-ghost flex-1 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTarget}
                className="btn-primary flex-1 text-xs"
              >
                Save Target
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add PR Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h2 className="text-base font-bold text-text-primary">Record Personal Best</h2>
              <button onClick={() => setShowAddModal(false)} className="text-text-muted p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="section-title mb-1.5 block">EXERCISE</label>
                <select
                  value={exercise}
                  onChange={(e) => setExercise(e.target.value)}
                  className="w-full"
                >
                  <option value="">Select an exercise...</option>
                  {availableExercises.map((ex) => (
                    <option key={ex} value={ex}>
                      {ex}
                    </option>
                  ))}
                  <option value="Custom">Custom Exercise...</option>
                </select>
              </div>

              {exercise === 'Custom' && (
                <div>
                  <label className="section-title mb-1.5 block">CUSTOM EXERCISE NAME</label>
                  <input
                    type="text"
                    value={customExercise}
                    onChange={(e) => setCustomExercise(e.target.value)}
                    placeholder="e.g. Front Squat"
                    className="w-full"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="section-title mb-1.5 block">WEIGHT</label>
                  <div className="flex">
                    <input
                      type="number"
                      step="0.5"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-r-none"
                    />
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value as 'kg' | 'lbs')}
                      className="rounded-l-none border-l-0 bg-bg-secondary px-2 font-mono text-xs"
                    >
                      <option value="kg">kg</option>
                      <option value="lbs">lbs</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="section-title mb-1.5 block">REPS</label>
                  <input
                    type="number"
                    min="1"
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                    placeholder="1"
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="section-title mb-1.5 block">DATE</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full"
                />
              </div>

              <div>
                <label className="section-title mb-1.5 block">NOTES (OPTIONAL)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="RPE, bar speed, cue, beltless..."
                  className="w-full h-18 resize-none text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="btn-ghost flex-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePR}
                  disabled={!weight || !reps || (!exercise && !customExercise.trim())}
                  className="btn-primary flex-1 disabled:opacity-40 text-xs"
                >
                  Save Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
