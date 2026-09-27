import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { getLiftLevel, getOverallLevel, getExerciseList, calculateOneRepMax } from '@/lib/strength-standards';
import { Plus, Trash2, X, Activity } from 'lucide-react';

export default function PRsPage() {
  const { profile, prs, addPR, deletePR } = useStore();
  const [showForm, setShowForm] = useState(false);

  const [exercise, setExercise] = useState('');
  const [customExercise, setCustomExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lbs'>(profile?.unit || 'kg');
  const [reps, setReps] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const availableExercises = getExerciseList();

  const handleSave = () => {
    if (!weight || !reps || !date) return;
    const finalExercise = exercise === 'Custom' ? customExercise : exercise;
    if (!finalExercise) return;

    const weightNum = parseFloat(weight);
    const repsNum = parseInt(reps, 10);
    
    let weightKg = 0;
    let weightLbs = 0;
    
    if (unit === 'lbs') {
      weightLbs = weightNum;
      weightKg = weightNum * 0.453592;
    } else {
      weightKg = weightNum;
      weightLbs = weightNum * 2.20462;
    }
    
    const oneRepMax = calculateOneRepMax(weightKg, repsNum);
    
    addPR({
      id: crypto.randomUUID(),
      exercise: finalExercise,
      weightKg,
      weightLbs,
      reps: repsNum,
      oneRepMax,
      date,
      notes
    });
    
    setShowForm(false);
    setExercise('');
    setCustomExercise('');
    setWeight('');
    setReps('');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const groupedPRs = useMemo(() => {
    const groups: Record<string, { prs: any[], best1RMKg: number, level: any }> = {};
    
    prs.forEach(pr => {
      if (!groups[pr.exercise]) {
        groups[pr.exercise] = { prs: [], best1RMKg: 0, level: null };
      }
      groups[pr.exercise].prs.push(pr);
      const pr1RMKg = calculateOneRepMax(pr.weightKg, pr.reps);
      if (pr1RMKg > groups[pr.exercise].best1RMKg) {
        groups[pr.exercise].best1RMKg = pr1RMKg;
      }
    });

    Object.keys(groups).forEach(ex => {
      groups[ex].prs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      if (profile && profile.bodyweightKg) {
        groups[ex].level = getLiftLevel(ex, groups[ex].best1RMKg, profile.bodyweightKg, profile.gender || 'male');
      }
    });

    return Object.entries(groups)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => {
        const levelA = a.level?.level || 0;
        const levelB = b.level?.level || 0;
        return levelB - levelA;
      });
  }, [prs, profile]);

  const overallLevel = useMemo(() => {
    const levels = groupedPRs.map(g => g.level).filter(Boolean);
    if (levels.length > 0) {
      try {
        return getOverallLevel(levels);
      } catch (e) {
        const avg = levels.reduce((sum, l) => sum + (l?.level || 0), 0) / levels.length;
        return {
          level: Math.round(avg),
          title: 'Overall',
          category: 'Mixed'
        };
      }
    }
    return null;
  }, [groupedPRs]);

  const userUnit = profile?.unit || 'kg';

  return (
    <div className="page animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Personal Records</h1>
          {overallLevel && (
            <div className="flex items-center gap-2 mt-2">
              <Activity className="w-5 h-5 text-accent" />
              <span className="text-accent font-medium">Level {overallLevel.level}: {overallLevel.title}</span>
            </div>
          )}
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Add PR</span>
        </button>
      </div>

      {overallLevel && (
        <div className="card mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-text-secondary">Overall Strength Level</span>
            <span className="text-sm font-bold text-text-primary">{overallLevel.level}/100</span>
          </div>
          <div className="level-bar">
            <div className="level-bar-fill" style={{ width: `${overallLevel.level}%` }} />
          </div>
        </div>
      )}

      {groupedPRs.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-text-secondary">No personal records yet. Start tracking your lifts.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedPRs.map((group) => (
            <div key={group.name} className="card">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-xl font-bold text-text-primary">{group.name}</h2>
                  {group.level && (
                    <span className="text-sm font-medium text-accent">
                      {group.level.title}
                    </span>
                  )}
                </div>
                {group.level && (
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-text-secondary">{group.level.category}</span>
                      <span className="text-xs text-text-secondary">Level {group.level.level}/100</span>
                    </div>
                    <div className="level-bar">
                      <div className="level-bar-fill" style={{ width: `${group.level.level}%` }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {group.prs.map((pr) => {
                  const displayWeight = userUnit === 'lbs' ? pr.weightLbs : pr.weightKg;
                  const display1RM = calculateOneRepMax(displayWeight, pr.reps);
                  
                  return (
                    <div key={pr.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-elevated/50 border border-border">
                      <div>
                        <div className="font-bold text-text-primary">
                          {Math.round(displayWeight * 10) / 10} {userUnit} × {pr.reps} reps
                        </div>
                        <div className="text-xs text-text-secondary flex gap-2 mt-1 font-mono">
                          <span>Est. 1RM: {Math.round(display1RM * 10) / 10} {userUnit}</span>
                          <span>•</span>
                          <span>{new Date(pr.date).toLocaleDateString()}</span>
                        </div>
                        {pr.notes && (
                          <div className="text-xs text-text-muted mt-1 italic">
                            &quot;{pr.notes}&quot;
                          </div>
                        )}
                      </div>
                      <button 
                        className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
                        onClick={() => deletePR(pr.id)}
                        title="Delete PR"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-text-primary">Add Personal Record</h2>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Exercise</label>
                <select 
                  className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent"
                  value={exercise}
                  onChange={(e) => setExercise(e.target.value)}
                >
                  <option value="">Select exercise...</option>
                  {availableExercises.map(ex => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                  <option value="Custom">Other (Custom)...</option>
                </select>
              </div>

              {exercise === 'Custom' && (
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Custom Exercise Name</label>
                  <input
                    type="text"
                    className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                    value={customExercise}
                    onChange={(e) => setCustomExercise(e.target.value)}
                    placeholder="e.g., Bulgarian Split Squat"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Weight</label>
                  <div className="flex">
                    <input
                      type="number"
                      step="0.5"
                      className="w-full bg-bg-elevated border border-border rounded-l-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="0"
                    />
                    <select
                      className="bg-bg-card border border-l-0 border-border rounded-r-lg px-3 py-2 text-text-primary text-xs focus:outline-none"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value as 'kg' | 'lbs')}
                    >
                      <option value="kg">kg</option>
                      <option value="lbs">lbs</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Reps</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                    placeholder="1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Date</label>
                <input
                  type="date"
                  className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Notes (Optional)</label>
                <textarea
                  className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent resize-none h-20"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="How did the lift feel?"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  className="btn-ghost flex-1"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary flex-1"
                  onClick={handleSave}
                  disabled={!weight || !reps || !date || (!exercise && !customExercise)}
                >
                  Save PR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
