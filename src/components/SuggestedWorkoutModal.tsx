"use client";

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Play,
  BookmarkPlus,
  Plus,
  Trash2,
  Dumbbell,
  Zap,
  Flame,
  Shield,
  Layers,
  Check,
} from 'lucide-react';
import { getExerciseList, getExerciseEquipment } from '@/lib/strength-standards';
import { PlannedExercise, PlannedWorkout } from '@/lib/store';
import { EquipmentType } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

export type BodyPartOption =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'push'
  | 'pull'
  | 'core'
  | 'full_body';

export type IntensityOption = 'low' | 'medium' | 'high';

interface SuggestedWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  userUnit: 'kg' | 'lbs';
  onStartWorkout: (workoutName: string, exercises: PlannedExercise[]) => void;
  onSavePlan: (plan: Omit<PlannedWorkout, 'id' | 'createdAt'>) => void;
}

const BODY_PARTS: { id: BodyPartOption; label: string; icon: string; description: string }[] = [
  { id: 'chest',      label: 'Chest',       icon: '🎯', description: 'Upper & Lower Pecs' },
  { id: 'back',       label: 'Back',        icon: '🦅', description: 'Lats, Rhomboids & Traps' },
  { id: 'legs',       label: 'Legs',        icon: '🦵', description: 'Quads, Hamstrings & Calves' },
  { id: 'shoulders',  label: 'Shoulders',   icon: '🛡️', description: 'Deltoids & Traps' },
  { id: 'arms',       label: 'Arms',        icon: '💪', description: 'Biceps & Triceps' },
  { id: 'push',       label: 'Push',        icon: '🔥', description: 'Chest, Shoulders & Triceps' },
  { id: 'pull',       label: 'Pull',        icon: '⚡', description: 'Back, Biceps & Rear Delts' },
  { id: 'core',       label: 'Core',        icon: '🧱', description: 'Abs & Core Stability' },
  { id: 'full_body',  label: 'Full Body',   icon: '👑', description: 'Total Body Heavy Compounds' },
];

const INTENSITIES: { id: IntensityOption; label: string; tag: string; description: string; badgeColor: string }[] = [
  {
    id: 'low',
    label: 'Low',
    tag: 'Deload / Form / Mobility',
    description: '3 exercises • 2–3 sets • 10–12 reps • Lighter weights for form & recovery',
    badgeColor: 'text-sky-600 bg-sky-500/10 border-sky-500/30',
  },
  {
    id: 'medium',
    label: 'Medium',
    tag: 'Hypertrophy & Growth',
    description: '4–5 exercises • 3 sets • 8–10 reps • Balanced progressive overload',
    badgeColor: 'text-amber-600 bg-amber-500/10 border-amber-500/30',
  },
  {
    id: 'high',
    label: 'High',
    tag: 'Maximum Strength & Density',
    description: '5–6 exercises • 3–4 heavy sets • 5–8 reps • Heavy compounds + burnout',
    badgeColor: 'text-accent bg-accent/15 border-accent/40',
  },
];

// ── Curated exercise routines per body part & intensity ───────────────────────
const SUGGESTED_ROUTINES: Record<BodyPartOption, Record<IntensityOption, { name: string; targetSets: number; targetReps: number }[]>> = {
  chest: {
    low: [
      { name: 'Dumbbell Press', targetSets: 3, targetReps: 10 },
      { name: 'Incline Dumbbell Press', targetSets: 3, targetReps: 12 },
      { name: 'Push-ups', targetSets: 2, targetReps: 12 },
    ],
    medium: [
      { name: 'Bench Press', targetSets: 3, targetReps: 8 },
      { name: 'Incline Dumbbell Press', targetSets: 3, targetReps: 10 },
      { name: 'Chest Fly', targetSets: 3, targetReps: 12 },
      { name: 'Dips', targetSets: 3, targetReps: 8 },
    ],
    high: [
      { name: 'Bench Press', targetSets: 4, targetReps: 5 },
      { name: 'Incline Bench', targetSets: 3, targetReps: 6 },
      { name: 'Dips', targetSets: 3, targetReps: 8 },
      { name: 'Dumbbell Fly', targetSets: 3, targetReps: 10 },
      { name: 'Push-ups', targetSets: 3, targetReps: 15 },
    ],
  },
  back: {
    low: [
      { name: 'Lat Pulldown', targetSets: 3, targetReps: 10 },
      { name: 'Cable Row', targetSets: 3, targetReps: 12 },
      { name: 'Dumbbell Row', targetSets: 2, targetReps: 12 },
    ],
    medium: [
      { name: 'Barbell Row', targetSets: 3, targetReps: 8 },
      { name: 'Lat Pulldown', targetSets: 3, targetReps: 10 },
      { name: 'Cable Row', targetSets: 3, targetReps: 10 },
      { name: 'Dumbbell Row', targetSets: 3, targetReps: 10 },
      { name: 'Face Pull', targetSets: 3, targetReps: 12 },
    ],
    high: [
      { name: 'Deadlift', targetSets: 4, targetReps: 5 },
      { name: 'Pull-ups', targetSets: 3, targetReps: 8 },
      { name: 'Barbell Row', targetSets: 3, targetReps: 6 },
      { name: 'Lat Pulldown', targetSets: 3, targetReps: 8 },
      { name: 'Face Pull', targetSets: 3, targetReps: 12 },
    ],
  },
  legs: {
    low: [
      { name: 'Goblet Squat', targetSets: 3, targetReps: 10 },
      { name: 'Leg Press', targetSets: 3, targetReps: 12 },
      { name: 'Leg Curl', targetSets: 2, targetReps: 12 },
    ],
    medium: [
      { name: 'Squat', targetSets: 3, targetReps: 8 },
      { name: 'Romanian Deadlift', targetSets: 3, targetReps: 10 },
      { name: 'Leg Press', targetSets: 3, targetReps: 10 },
      { name: 'Leg Curl', targetSets: 3, targetReps: 10 },
      { name: 'Dumbbell Lunge', targetSets: 2, targetReps: 12 },
    ],
    high: [
      { name: 'Squat', targetSets: 4, targetReps: 6 },
      { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8 },
      { name: 'Front Squat', targetSets: 3, targetReps: 6 },
      { name: 'Leg Press', targetSets: 3, targetReps: 10 },
      { name: 'Leg Extension', targetSets: 3, targetReps: 12 },
      { name: 'Leg Curl', targetSets: 3, targetReps: 10 },
    ],
  },
  shoulders: {
    low: [
      { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 10 },
      { name: 'Dumbbell Lateral Raise', targetSets: 3, targetReps: 12 },
      { name: 'Face Pull', targetSets: 2, targetReps: 12 },
    ],
    medium: [
      { name: 'Overhead Press', targetSets: 3, targetReps: 8 },
      { name: 'Arnold Press', targetSets: 3, targetReps: 10 },
      { name: 'Dumbbell Lateral Raise', targetSets: 3, targetReps: 12 },
      { name: 'Face Pull', targetSets: 3, targetReps: 12 },
    ],
    high: [
      { name: 'Overhead Press', targetSets: 4, targetReps: 5 },
      { name: 'Arnold Press', targetSets: 3, targetReps: 8 },
      { name: 'Dumbbell Lateral Raise', targetSets: 4, targetReps: 10 },
      { name: 'Face Pull', targetSets: 3, targetReps: 10 },
      { name: 'Dumbbell Press', targetSets: 3, targetReps: 8 },
    ],
  },
  arms: {
    low: [
      { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10 },
      { name: 'Tricep Pushdown', targetSets: 3, targetReps: 10 },
      { name: 'Hammer Curl', targetSets: 2, targetReps: 12 },
    ],
    medium: [
      { name: 'Close Grip Bench', targetSets: 3, targetReps: 8 },
      { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10 },
      { name: 'Tricep Pushdown', targetSets: 3, targetReps: 10 },
      { name: 'Hammer Curl', targetSets: 3, targetReps: 10 },
      { name: 'Preacher Curl', targetSets: 2, targetReps: 12 },
    ],
    high: [
      { name: 'Close Grip Bench', targetSets: 4, targetReps: 6 },
      { name: 'Dips', targetSets: 3, targetReps: 8 },
      { name: 'Dumbbell Curl', targetSets: 3, targetReps: 8 },
      { name: 'Tricep Pushdown', targetSets: 3, targetReps: 8 },
      { name: 'Hammer Curl', targetSets: 3, targetReps: 8 },
      { name: 'Tricep Kickback', targetSets: 2, targetReps: 12 },
    ],
  },
  push: {
    low: [
      { name: 'Dumbbell Press', targetSets: 3, targetReps: 10 },
      { name: 'Incline Dumbbell Press', targetSets: 2, targetReps: 12 },
      { name: 'Tricep Pushdown', targetSets: 2, targetReps: 12 },
    ],
    medium: [
      { name: 'Bench Press', targetSets: 3, targetReps: 8 },
      { name: 'Incline Dumbbell Press', targetSets: 3, targetReps: 10 },
      { name: 'Dumbbell Lateral Raise', targetSets: 3, targetReps: 12 },
      { name: 'Tricep Pushdown', targetSets: 3, targetReps: 10 },
      { name: 'Push-ups', targetSets: 2, targetReps: 15 },
    ],
    high: [
      { name: 'Bench Press', targetSets: 4, targetReps: 5 },
      { name: 'Incline Bench', targetSets: 3, targetReps: 6 },
      { name: 'Overhead Press', targetSets: 3, targetReps: 6 },
      { name: 'Dips', targetSets: 3, targetReps: 8 },
      { name: 'Dumbbell Lateral Raise', targetSets: 4, targetReps: 10 },
      { name: 'Tricep Pushdown', targetSets: 3, targetReps: 10 },
    ],
  },
  pull: {
    low: [
      { name: 'Lat Pulldown', targetSets: 3, targetReps: 10 },
      { name: 'Cable Row', targetSets: 2, targetReps: 12 },
      { name: 'Dumbbell Curl', targetSets: 2, targetReps: 12 },
    ],
    medium: [
      { name: 'Barbell Row', targetSets: 3, targetReps: 8 },
      { name: 'Lat Pulldown', targetSets: 3, targetReps: 10 },
      { name: 'Cable Row', targetSets: 3, targetReps: 10 },
      { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10 },
      { name: 'Face Pull', targetSets: 3, targetReps: 12 },
    ],
    high: [
      { name: 'Deadlift', targetSets: 4, targetReps: 5 },
      { name: 'Pull-ups', targetSets: 3, targetReps: 8 },
      { name: 'Barbell Row', targetSets: 3, targetReps: 6 },
      { name: 'Lat Pulldown', targetSets: 3, targetReps: 8 },
      { name: 'Face Pull', targetSets: 3, targetReps: 12 },
      { name: 'Hammer Curl', targetSets: 3, targetReps: 8 },
    ],
  },
  core: {
    low: [
      { name: 'Push-ups', targetSets: 3, targetReps: 12 },
      { name: 'Cable Row', targetSets: 3, targetReps: 12 },
    ],
    medium: [
      { name: 'Push-ups', targetSets: 3, targetReps: 15 },
      { name: 'Pull-ups', targetSets: 3, targetReps: 6 },
      { name: 'Romanian Deadlift', targetSets: 3, targetReps: 10 },
    ],
    high: [
      { name: 'Deadlift', targetSets: 4, targetReps: 6 },
      { name: 'Front Squat', targetSets: 3, targetReps: 6 },
      { name: 'Pull-ups', targetSets: 3, targetReps: 8 },
      { name: 'Push-ups', targetSets: 3, targetReps: 20 },
    ],
  },
  full_body: {
    low: [
      { name: 'Goblet Squat', targetSets: 3, targetReps: 10 },
      { name: 'Dumbbell Press', targetSets: 3, targetReps: 10 },
      { name: 'Lat Pulldown', targetSets: 3, targetReps: 10 },
    ],
    medium: [
      { name: 'Squat', targetSets: 3, targetReps: 8 },
      { name: 'Bench Press', targetSets: 3, targetReps: 8 },
      { name: 'Barbell Row', targetSets: 3, targetReps: 8 },
      { name: 'Overhead Press', targetSets: 3, targetReps: 8 },
      { name: 'Dumbbell Curl', targetSets: 2, targetReps: 10 },
    ],
    high: [
      { name: 'Squat', targetSets: 4, targetReps: 5 },
      { name: 'Bench Press', targetSets: 4, targetReps: 5 },
      { name: 'Deadlift', targetSets: 3, targetReps: 5 },
      { name: 'Overhead Press', targetSets: 3, targetReps: 6 },
      { name: 'Pull-ups', targetSets: 3, targetReps: 8 },
      { name: 'Dips', targetSets: 3, targetReps: 8 },
    ],
  },
};

const EQUIPMENT_BADGE_STYLE: Record<EquipmentType, { label: string; icon: string; style: string }> = {
  barbell:    { label: 'Barbell',    icon: '🏋️', style: 'bg-accent/15 text-accent border-accent/30' },
  dumbbell:   { label: 'Dumbbell',   icon: '🪙', style: 'bg-info/15 text-info border-info/30' },
  cable:      { label: 'Cable',      icon: '🔗', style: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  bodyweight: { label: 'Bodyweight', icon: '🤸', style: 'bg-warning/15 text-warning border-warning/30' },
  machine:    { label: 'Machine',    icon: '⚙️', style: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  other:      { label: 'Other',      icon: '⚡', style: 'bg-text-muted/15 text-text-muted border-border' },
};

export default function SuggestedWorkoutModal({
  isOpen,
  onClose,
  userUnit,
  onStartWorkout,
  onSavePlan,
}: SuggestedWorkoutModalProps) {
  const [selectedBodyPart, setSelectedBodyPart] = useState<BodyPartOption>('push');
  const [selectedIntensity, setSelectedIntensity] = useState<IntensityOption>('medium');
  const [planTitle, setPlanTitle] = useState('');
  const [exercises, setExercises] = useState<PlannedExercise[]>([]);
  const toast = useToast();

  const availableExercises = getExerciseList();

  // Generate routine when body part or intensity changes
  useEffect(() => {
    if (!isOpen) return;

    const bodyPartMeta = BODY_PARTS.find((b) => b.id === selectedBodyPart);
    const intensityMeta = INTENSITIES.find((i) => i.id === selectedIntensity);
    const defaultTitle = `${bodyPartMeta?.label || 'Workout'} (${intensityMeta?.label} Intensity)`;
    setPlanTitle(defaultTitle);

    const template = SUGGESTED_ROUTINES[selectedBodyPart]?.[selectedIntensity] || [];
    const generated: PlannedExercise[] = template.map((item) => ({
      name: item.name,
      targetSets: item.targetSets,
      targetReps: item.targetReps,
      targetUnit: userUnit,
      notes: '',
    }));
    setExercises(generated);
  }, [isOpen, selectedBodyPart, selectedIntensity, userUnit]);

  if (!isOpen) return null;

  const handleUpdateExercise = (index: number, field: keyof PlannedExercise, value: any) => {
    setExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  };

  const handleRemoveExercise = (index: number) => {
    if (exercises.length <= 1) {
      toast.error('Workout must have at least one exercise.');
      return;
    }
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddExercise = () => {
    setExercises((prev) => [
      ...prev,
      {
        name: '',
        targetSets: 3,
        targetReps: 10,
        targetUnit: userUnit,
        notes: '',
      },
    ]);
  };

  const handleStartNow = () => {
    const valid = exercises.filter((e) => e.name.trim());
    if (valid.length === 0) {
      toast.error('Please include at least one named exercise.');
      return;
    }
    const title = planTitle.trim() || 'Suggested Workout';
    onStartWorkout(title, valid);
    toast.success(`Loaded "${title}" into logger. Let's lift!`, 'Workout Started');
    onClose();
  };

  const handleSaveToPlans = () => {
    const valid = exercises.filter((e) => e.name.trim());
    if (valid.length === 0) {
      toast.error('Please include at least one named exercise.');
      return;
    }
    const title = planTitle.trim() || 'Suggested Workout';
    onSavePlan({
      name: title,
      exercises: valid,
    });
    toast.success(`Saved "${title}" to your Workout Plans!`, 'Plan Saved');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-xl p-5 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Suggested Workout Generator</h2>
              <p className="text-2xs text-text-muted">
                Pick target muscle &amp; intensity to generate a tailored routine
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1: Body Part Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider font-mono flex items-center gap-1.5">
              <span>1. Choose Target Muscle Group</span>
            </label>
            <span className="text-2xs text-accent font-semibold">
              {BODY_PARTS.find((b) => b.id === selectedBodyPart)?.label} Selected
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {BODY_PARTS.map((bp) => {
              const isSelected = selectedBodyPart === bp.id;
              return (
                <button
                  key={bp.id}
                  type="button"
                  onClick={() => setSelectedBodyPart(bp.id)}
                  className={`p-2 rounded-xl border text-center transition-all active:scale-95 ${
                    isSelected
                      ? 'bg-accent/15 border-accent text-accent shadow-xs'
                      : 'bg-bg-card border-border text-text-secondary hover:text-text-primary hover:border-accent/40'
                  }`}
                >
                  <div className="text-base leading-none mb-1">{bp.icon}</div>
                  <div className="text-xs font-bold truncate">{bp.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Intensity Selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wider font-mono flex items-center gap-1.5">
            <span>2. Select Workout Intensity</span>
          </label>

          <div className="grid grid-cols-3 gap-2">
            {INTENSITIES.map((lvl) => {
              const isSelected = selectedIntensity === lvl.id;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => setSelectedIntensity(lvl.id)}
                  className={`p-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
                    isSelected
                      ? `${lvl.badgeColor} shadow-xs ring-1 ring-accent/30`
                      : 'bg-bg-card border-border text-text-secondary hover:text-text-primary hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">{lvl.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <p className="text-[10px] opacity-80 leading-snug">{lvl.tag}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3: Editable Suggested Plan */}
        <div className="space-y-3 pt-1 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-2">
              <label className="text-2xs font-bold text-text-muted uppercase tracking-wider font-mono block mb-1">
                Workout Plan Title (Editable)
              </label>
              <input
                type="text"
                value={planTitle}
                onChange={(e) => setPlanTitle(e.target.value)}
                className="w-full bg-bg-elevated border border-border rounded-lg p-2 text-sm font-bold text-text-primary focus:border-accent outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleAddExercise}
              className="mt-4 px-2.5 py-1.5 rounded-lg bg-bg-card border border-border hover:border-accent text-accent text-xs font-semibold flex items-center gap-1 shrink-0 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Exercise</span>
            </button>
          </div>

          {/* Datalist for autocomplete */}
          <datalist id="suggested-exercises-list">
            {availableExercises.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          {/* Exercise list */}
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {exercises.map((ex, idx) => {
              const eqType = getExerciseEquipment(ex.name);
              const badge = EQUIPMENT_BADGE_STYLE[eqType] || EQUIPMENT_BADGE_STYLE.other;

              return (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-bg-card border border-border space-y-2 relative group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-2xs font-mono font-bold text-text-muted">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={ex.name}
                        onChange={(e) => handleUpdateExercise(idx, 'name', e.target.value)}
                        placeholder="Exercise name"
                        list="suggested-exercises-list"
                        className="bg-transparent font-bold text-xs text-text-primary focus:bg-bg-elevated p-1 rounded border border-transparent focus:border-accent outline-none flex-1 truncate"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${badge.style}`}
                      >
                        <span>{badge.icon}</span>
                        <span>{badge.label}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveExercise(idx)}
                        className="p-1 text-text-muted hover:text-danger rounded hover:bg-danger/10 transition-colors"
                        title="Remove exercise"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Target Sets & Reps row */}
                  <div className="flex items-center gap-3 pt-0.5 text-xs text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <label className="text-2xs font-mono text-text-muted uppercase">Sets:</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={ex.targetSets}
                        onChange={(e) =>
                          handleUpdateExercise(idx, 'targetSets', parseInt(e.target.value) || 1)
                        }
                        className="w-12 bg-bg-elevated border border-border rounded p-1 text-center font-bold text-text-primary text-xs outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-2xs font-mono text-text-muted uppercase">Reps:</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={ex.targetReps}
                        onChange={(e) =>
                          handleUpdateExercise(idx, 'targetReps', parseInt(e.target.value) || 1)
                        }
                        className="w-12 bg-bg-elevated border border-border rounded p-1 text-center font-bold text-text-primary text-xs outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <label className="text-2xs font-mono text-text-muted uppercase">Weight:</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={ex.targetWeight !== undefined ? ex.targetWeight : ''}
                        onChange={(e) =>
                          handleUpdateExercise(
                            idx,
                            'targetWeight',
                            e.target.value ? parseFloat(e.target.value) : undefined
                          )
                        }
                        className="w-14 bg-bg-elevated border border-border rounded p-1 text-center font-medium text-text-primary text-xs outline-none focus:border-accent"
                      />
                      <span className="text-2xs text-text-muted font-mono">{userUnit}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 flex flex-col sm:flex-row gap-2 border-t border-border">
          <button
            type="button"
            onClick={handleSaveToPlans}
            className="btn-secondary py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <BookmarkPlus className="w-4 h-4 text-accent" />
            <span>Save as Planned Workout</span>
          </button>
          <button
            type="button"
            onClick={handleStartNow}
            className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-accent/25 hover:brightness-105 active:scale-95 transition-all"
          >
            <Play className="w-4 h-4 fill-white stroke-white" />
            <span>START WORKOUT NOW</span>
          </button>
        </div>
      </div>
    </div>
  );
}
