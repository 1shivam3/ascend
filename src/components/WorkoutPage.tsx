"use client";

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { getExerciseList } from '@/lib/strength-standards';
import { Plus, X, ChevronDown, ChevronUp, Calendar, Trash2 } from 'lucide-react';
import { WorkoutEntry, WorkoutExercise, WorkoutSet } from '@/lib/store';

export default function WorkoutPage() {
  const profile = useStore((state) => state.profile);
  const workouts = useStore((state) => state.workouts);
  const addWorkout = useStore((state) => state.addWorkout);
  const deleteWorkout = useStore((state) => state.deleteWorkout);
  
  const userUnit = profile?.unit || 'kg';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());
  
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
  
  const handleSaveWorkout = () => {
    const validExercises = exercises.filter(e => e.name.trim() && e.sets.length > 0);
    if (validExercises.length === 0) return;
    
    const newWorkout: WorkoutEntry = {
      id: crypto.randomUUID(),
      date,
      exercises: validExercises
    };
    
    addWorkout(newWorkout);
    setIsModalOpen(false);
    setDate(new Date().toISOString().split('T')[0]);
    setExercises([]);
  };
  
  const sortedWorkouts = useMemo(() => {
    return [...workouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20);
  }, [workouts]);
  
  return (
    <div className="page animate-fade-in">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Workouts</h1>
          <p className="text-xs text-text-muted mt-0.5">Log your sessions & track consistency</p>
        </div>
        <button className="btn-primary flex items-center gap-1.5" onClick={() => {
          if (exercises.length === 0) handleAddExercise();
          setIsModalOpen(true);
        }}>
          <Plus className="w-4 h-4" />
          Log Workout
        </button>
      </header>

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
                          onClick={() => deleteWorkout(workout.id)}
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
    </div>
  );
}
