'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  Dumbbell,
  Plus,
  History,
  Trophy,
  Filter,
  Check,
} from 'lucide-react';
import { WorkoutEntry, PersonalRecord } from '@/lib/types';
import { getExercisesByCategory, calculateOneRepMax } from '@/lib/strength-standards';
import { getLastExercisePerformance } from '@/lib/workout-engine';

interface ExerciseLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExercise: (exerciseName: string) => void;
  workouts: WorkoutEntry[];
  prs: PersonalRecord[];
  userUnit?: 'kg' | 'lbs';
}

interface ExerciseMetadata {
  name: string;
  category: string;
  equipment: 'barbell' | 'dumbbell' | 'bodyweight' | 'cable' | 'machine';
  muscle: 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core';
}

const EXERCISE_METADATA: Record<string, { equipment: ExerciseMetadata['equipment']; muscle: ExerciseMetadata['muscle'] }> = {
  // Barbell Compounds
  'Bench Press': { equipment: 'barbell', muscle: 'Chest' },
  'Squat': { equipment: 'barbell', muscle: 'Legs' },
  'Deadlift': { equipment: 'barbell', muscle: 'Back' },
  'Overhead Press': { equipment: 'barbell', muscle: 'Shoulders' },
  'Barbell Row': { equipment: 'barbell', muscle: 'Back' },
  'Romanian Deadlift': { equipment: 'barbell', muscle: 'Legs' },
  'Incline Bench': { equipment: 'barbell', muscle: 'Chest' },
  'Front Squat': { equipment: 'barbell', muscle: 'Legs' },
  'Close Grip Bench': { equipment: 'barbell', muscle: 'Arms' },
  'Sumo Deadlift': { equipment: 'barbell', muscle: 'Legs' },

  // Dumbbell
  'Dumbbell Press': { equipment: 'dumbbell', muscle: 'Chest' },
  'Dumbbell Row': { equipment: 'dumbbell', muscle: 'Back' },
  'Dumbbell Curl': { equipment: 'dumbbell', muscle: 'Arms' },
  'Incline Dumbbell Press': { equipment: 'dumbbell', muscle: 'Chest' },
  'Dumbbell Shoulder Press': { equipment: 'dumbbell', muscle: 'Shoulders' },
  'Dumbbell Lateral Raise': { equipment: 'dumbbell', muscle: 'Shoulders' },
  'Dumbbell Fly': { equipment: 'dumbbell', muscle: 'Chest' },
  'Hammer Curl': { equipment: 'dumbbell', muscle: 'Arms' },
  'Tricep Kickback': { equipment: 'dumbbell', muscle: 'Arms' },
  'Goblet Squat': { equipment: 'dumbbell', muscle: 'Legs' },
  'Dumbbell Lunge': { equipment: 'dumbbell', muscle: 'Legs' },
  'Arnold Press': { equipment: 'dumbbell', muscle: 'Shoulders' },
  'Preacher Curl': { equipment: 'dumbbell', muscle: 'Arms' },

  // Bodyweight
  'Pull-ups': { equipment: 'bodyweight', muscle: 'Back' },
  'Dips': { equipment: 'bodyweight', muscle: 'Chest' },
  'Push-ups': { equipment: 'bodyweight', muscle: 'Chest' },

  // Cable
  'Lat Pulldown': { equipment: 'cable', muscle: 'Back' },
  'Cable Row': { equipment: 'cable', muscle: 'Back' },
  'Chest Fly': { equipment: 'cable', muscle: 'Chest' },
  'Face Pull': { equipment: 'cable', muscle: 'Shoulders' },
  'Tricep Pushdown': { equipment: 'cable', muscle: 'Arms' },

  // Machine
  'Leg Press': { equipment: 'machine', muscle: 'Legs' },
  'Leg Curl': { equipment: 'machine', muscle: 'Legs' },
  'Leg Extension': { equipment: 'machine', muscle: 'Legs' },
  'Chest Press Machine': { equipment: 'machine', muscle: 'Chest' },
  'Hack Squat': { equipment: 'machine', muscle: 'Legs' },
  'Seated Cable Row': { equipment: 'cable', muscle: 'Back' },
  'Bicep Curl Machine': { equipment: 'machine', muscle: 'Arms' },
};

export default function ExerciseLibraryModal({
  isOpen,
  onClose,
  onSelectExercise,
  workouts,
  prs,
  userUnit = 'kg',
}: ExerciseLibraryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<string>('all');
  const [selectedMuscle, setSelectedMuscle] = useState<string>('all');

  const exerciseCategories = useMemo(() => getExercisesByCategory(), []);

  // Flattened exercises with rich metadata
  const allExercises = useMemo(() => {
    const list: ExerciseMetadata[] = [];
    const seen = new Set<string>();

    for (const group of exerciseCategories) {
      for (const name of group.exercises) {
        if (!seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          const meta = EXERCISE_METADATA[name] || {
            equipment: (group.category.toLowerCase().includes('barbell')
              ? 'barbell'
              : group.category.toLowerCase().includes('dumbbell')
              ? 'dumbbell'
              : group.category.toLowerCase().includes('bodyweight')
              ? 'bodyweight'
              : group.category.toLowerCase().includes('cable')
              ? 'cable'
              : 'machine') as ExerciseMetadata['equipment'],
            muscle: 'Chest',
          };
          list.push({
            name,
            category: group.category,
            equipment: meta.equipment,
            muscle: meta.muscle,
          });
        }
      }
    }
    return list;
  }, [exerciseCategories]);

  // Filtered exercises
  const filteredExercises = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allExercises.filter((ex) => {
      const matchesSearch = !query || ex.name.toLowerCase().includes(query);
      const matchesEquipment =
        selectedEquipment === 'all' || ex.equipment.toLowerCase() === selectedEquipment.toLowerCase();
      const matchesMuscle =
        selectedMuscle === 'all' || ex.muscle.toLowerCase() === selectedMuscle.toLowerCase();
      return matchesSearch && matchesEquipment && matchesMuscle;
    });
  }, [allExercises, searchQuery, selectedEquipment, selectedMuscle]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-lg w-full max-h-[85vh] flex flex-col p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-bg-card">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <Dumbbell className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Exercise Library</h2>
              <p className="text-3xs text-text-muted">Browse movements, equipment &amp; your lift history</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-border bg-bg-secondary/40 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search exercise (e.g. Bench, Squat, Curl)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent outline-none"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Equipment Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'barbell', label: 'Barbell' },
              { id: 'dumbbell', label: 'Dumbbell' },
              { id: 'bodyweight', label: 'Bodyweight' },
              { id: 'cable', label: 'Cable' },
              { id: 'machine', label: 'Machine' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedEquipment(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-2xs font-semibold whitespace-nowrap transition-colors ${
                  selectedEquipment === tab.id
                    ? 'bg-accent text-white font-bold'
                    : 'bg-bg-card border border-border text-text-muted hover:text-text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Muscle Group Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: 'All Muscles' },
              { id: 'chest', label: 'Chest' },
              { id: 'back', label: 'Back' },
              { id: 'legs', label: 'Legs' },
              { id: 'shoulders', label: 'Shoulders' },
              { id: 'arms', label: 'Arms' },
            ].map((muscle) => (
              <button
                key={muscle.id}
                type="button"
                onClick={() => setSelectedMuscle(muscle.id)}
                className={`px-2 py-0.5 rounded-md text-3xs font-medium whitespace-nowrap transition-colors ${
                  selectedMuscle === muscle.id
                    ? 'bg-text-primary text-bg-primary font-bold'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {muscle.label}
              </button>
            ))}
          </div>
        </div>

        {/* Exercises List */}
        <div className="flex-1 overflow-y-auto p-3 divide-y divide-border/60">
          {filteredExercises.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Dumbbell className="w-8 h-8 text-text-muted mx-auto stroke-1" />
              <p className="text-xs text-text-muted">No exercises match &quot;{searchQuery}&quot;</p>
              <button
                type="button"
                onClick={() => {
                  onSelectExercise(searchQuery.trim());
                  onClose();
                }}
                className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add &quot;{searchQuery}&quot; as custom exercise</span>
              </button>
            </div>
          ) : (
            filteredExercises.map((ex) => {
              const lastPerf = getLastExercisePerformance(ex.name, workouts);
              const matchingPR = prs.find(
                (p) => p.exercise.toLowerCase() === ex.name.toLowerCase()
              );

              return (
                <div
                  key={ex.name}
                  className="py-3 px-2 flex items-center justify-between hover:bg-bg-secondary/40 rounded-xl transition-colors group"
                >
                  <div className="space-y-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-text-primary truncate font-sans">
                        {ex.name}
                      </span>
                      <span className="text-3xs uppercase font-mono px-1.5 py-0.2 rounded bg-bg-secondary text-text-muted">
                        {ex.equipment}
                      </span>
                      <span className="text-3xs uppercase font-mono px-1.5 py-0.2 rounded bg-accent/10 text-accent">
                        {ex.muscle}
                      </span>
                    </div>

                    {/* History & PR Pills */}
                    <div className="flex items-center gap-2 text-3xs font-mono text-text-muted">
                      {lastPerf ? (
                        <span className="flex items-center gap-1 text-text-secondary">
                          <History className="w-3 h-3 text-text-muted shrink-0" />
                          Last: {lastPerf.summary}
                        </span>
                      ) : (
                        <span>No history logged</span>
                      )}

                      {matchingPR && (
                        <span className="flex items-center gap-1 text-accent font-semibold border-l border-border/80 pl-2">
                          <Trophy className="w-3 h-3 text-accent shrink-0" />
                          PR: {matchingPR.oneRepMax} {userUnit}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectExercise(ex.name);
                      onClose();
                    }}
                    className="btn-secondary py-1.5 px-3 text-xs font-semibold shrink-0 flex items-center gap-1 border-accent/40 text-accent hover:bg-accent/10 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Select</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-bg-card flex items-center justify-between text-2xs text-text-muted">
          <span>{filteredExercises.length} exercises found</span>
          <button
            type="button"
            onClick={onClose}
            className="text-text-primary hover:underline font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
