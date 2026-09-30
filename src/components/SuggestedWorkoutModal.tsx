"use client";

import React, { useState, useEffect, useMemo } from 'react';
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
  Search,
  ChevronRight,
  Sliders,
  Settings,
  Repeat
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
  | 'core'
  | 'push'
  | 'pull'
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
  { id: 'chest',      label: 'Chest',       icon: '🎯', description: 'Pectorals & Incline' },
  { id: 'back',       label: 'Back',        icon: '🦅', description: 'Lats, Traps & Rhomboids' },
  { id: 'shoulders',  label: 'Shoulders',   icon: '🛡️', description: 'Delts & Overhead' },
  { id: 'arms',       label: 'Arms',        icon: '💪', description: 'Biceps & Triceps' },
  { id: 'legs',       label: 'Legs',        icon: '🦵', description: 'Quads, Hamstrings & Calves' },
  { id: 'core',       label: 'Core / Abs',  icon: '🧱', description: 'Abs & Stability' },
  { id: 'push',       label: 'Push Day',    icon: '🔥', description: 'Chest, Shoulders & Triceps' },
  { id: 'pull',       label: 'Pull Day',    icon: '⚡', description: 'Back, Biceps & Rear Delts' },
  { id: 'full_body',  label: 'Full Body',   icon: '👑', description: 'Compound Total Body' },
];

interface SplitPreset {
  id: string;
  name: string;
  description: string;
  days: { name: string; bodyParts: BodyPartOption[] }[];
}

const SPLIT_PRESETS: SplitPreset[] = [
  {
    id: 'ppl',
    name: 'Push / Pull / Legs (PPL)',
    description: 'Gold standard 3-day or 6-day split grouping biomechanical muscle actions.',
    days: [
      { name: 'Push (Chest, Shoulders, Triceps)', bodyParts: ['chest', 'shoulders', 'arms'] },
      { name: 'Pull (Back, Biceps, Rear Delts)', bodyParts: ['back', 'arms'] },
      { name: 'Legs (Quads, Hamstrings, Calves)', bodyParts: ['legs', 'core'] },
    ],
  },
  {
    id: 'upper_lower',
    name: 'Upper / Lower',
    description: 'High-frequency 4-day split alternating upper body and lower body.',
    days: [
      { name: 'Upper A (Heavy Bench & Row)', bodyParts: ['chest', 'back', 'shoulders', 'arms'] },
      { name: 'Lower A (Heavy Squat)', bodyParts: ['legs', 'core'] },
      { name: 'Upper B (Incline & OHP)', bodyParts: ['shoulders', 'chest', 'back', 'arms'] },
      { name: 'Lower B (Heavy Deadlift)', bodyParts: ['legs', 'core'] },
    ],
  },
  {
    id: 'arnold',
    name: 'Arnold Split',
    description: 'Agonist/Antagonist pairing for massive pump and upper body development.',
    days: [
      { name: 'Chest & Back (Superset Focus)', bodyParts: ['chest', 'back'] },
      { name: 'Shoulders & Arms', bodyParts: ['shoulders', 'arms'] },
      { name: 'Legs & Abs', bodyParts: ['legs', 'core'] },
    ],
  },
  {
    id: 'bro_split',
    name: 'Bro Split (1 Muscle / Day)',
    description: 'Classic bodybuilding 5-day split targeting one muscle group per session.',
    days: [
      { name: 'Chest Day', bodyParts: ['chest'] },
      { name: 'Back Day', bodyParts: ['back'] },
      { name: 'Shoulders Day', bodyParts: ['shoulders'] },
      { name: 'Arms Day', bodyParts: ['arms'] },
      { name: 'Legs Day', bodyParts: ['legs'] },
    ],
  },
  {
    id: 'full_body',
    name: 'Full Body Compound',
    description: '3 days a week full body strength progression for maximum efficiency.',
    days: [
      { name: 'Full Body Session A', bodyParts: ['full_body'] },
      { name: 'Full Body Session B', bodyParts: ['full_body'] },
    ],
  },
];

const INTENSITIES: { id: IntensityOption; label: string; tag: string; description: string; badgeColor: string }[] = [
  {
    id: 'low',
    label: 'Low',
    tag: 'Deload / Form / Mobility',
    description: '3 exercises • 2–3 sets • 10–12 reps • Focus on technique',
    badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  },
  {
    id: 'medium',
    label: 'Medium',
    tag: 'Hypertrophy & Growth',
    description: '4–5 exercises • 3 sets • 8–10 reps • Balanced overload',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  {
    id: 'high',
    label: 'High',
    tag: 'Maximum Strength & Density',
    description: '5–6 exercises • 3–4 heavy sets • 5–8 reps • Heavy compound focus',
    badgeColor: 'text-accent bg-accent/15 border-accent/40',
  },
];

// Exercise pool mapped per body part
const BODY_PART_POOLS: Record<BodyPartOption, { compound: string[]; isolation: string[] }> = {
  chest: {
    compound: ['Bench Press', 'Incline Bench', 'Dips', 'Incline Dumbbell Press', 'Dumbbell Press'],
    isolation: ['Chest Fly', 'Dumbbell Fly', 'Cable Crossover', 'Push-ups'],
  },
  back: {
    compound: ['Deadlift', 'Barbell Row', 'Pull-ups', 'Lat Pulldown', 'T-Bar Row'],
    isolation: ['Cable Row', 'Dumbbell Row', 'Face Pull', 'Straight Arm Pulldown'],
  },
  legs: {
    compound: ['Squat', 'Front Squat', 'Romanian Deadlift', 'Leg Press'],
    isolation: ['Leg Extension', 'Hamstring Curl', 'Calf Raise', 'Bulgarian Split Squat', 'Dumbbell Lunge'],
  },
  shoulders: {
    compound: ['Overhead Press', 'Arnold Press', 'Dumbbell Shoulder Press', 'Push Press'],
    isolation: ['Dumbbell Lateral Raise', 'Cable Lateral Raise', 'Face Pull', 'Rear Delt Fly'],
  },
  arms: {
    compound: ['Close Grip Bench', 'Dips', 'Chin-ups'],
    isolation: ['Dumbbell Curl', 'Tricep Pushdown', 'Hammer Curl', 'Skull Crushers', 'Preacher Curl', 'Overhead Tricep Extension'],
  },
  core: {
    compound: ['Front Squat', 'Deadlift'],
    isolation: ['Hanging Leg Raise', 'Plank', 'Cable Crunch', 'Ab Wheel Rollout', 'Russian Twist'],
  },
  push: {
    compound: ['Bench Press', 'Incline Bench', 'Overhead Press', 'Dips'],
    isolation: ['Dumbbell Lateral Raise', 'Tricep Pushdown', 'Incline Dumbbell Press', 'Chest Fly'],
  },
  pull: {
    compound: ['Deadlift', 'Pull-ups', 'Barbell Row', 'Lat Pulldown'],
    isolation: ['Cable Row', 'Dumbbell Curl', 'Hammer Curl', 'Face Pull'],
  },
  full_body: {
    compound: ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull-ups'],
    isolation: ['Dumbbell Lateral Raise', 'Dumbbell Curl', 'Tricep Pushdown', 'Calf Raise'],
  },
};

export function generateExercisesFromSelection(
  bodyParts: BodyPartOption[],
  intensity: IntensityOption = 'medium',
  userUnit: 'kg' | 'lbs' = 'kg'
): PlannedExercise[] {
  const sets = intensity === 'low' ? 3 : intensity === 'medium' ? 3 : 4;
  const reps = intensity === 'low' ? 12 : intensity === 'medium' ? 8 : 6;
  const maxTotal = intensity === 'low' ? 4 : intensity === 'medium' ? 6 : 7;

  const validParts = bodyParts.length > 0 ? bodyParts : (['full_body'] as BodyPartOption[]);

  const chosenExercises: string[] = [];
  const addedNames = new Set<string>();

  // Determine how many exercises to pick per body part
  const perGroup = Math.max(1, Math.floor(maxTotal / validParts.length));

  // Pass 1: Add compound lifts evenly from each body part
  validParts.forEach((bp) => {
    const pool = BODY_PART_POOLS[bp] || BODY_PART_POOLS.chest;
    let addedForThisBp = 0;
    const targetCompound = Math.min(2, Math.max(1, Math.floor(perGroup * 0.6)));

    for (const c of pool.compound) {
      if (!addedNames.has(c) && addedForThisBp < targetCompound && chosenExercises.length < maxTotal) {
        chosenExercises.push(c);
        addedNames.add(c);
        addedForThisBp++;
      }
    }
  });

  // Pass 2: Add isolations / accessories evenly from each body part
  validParts.forEach((bp) => {
    const pool = BODY_PART_POOLS[bp] || BODY_PART_POOLS.chest;
    for (const iso of pool.isolation) {
      if (!addedNames.has(iso) && chosenExercises.length < maxTotal) {
        const countFromThisBp = chosenExercises.filter(
          (ex) => pool.compound.includes(ex) || pool.isolation.includes(ex)
        ).length;
        if (countFromThisBp < perGroup + 1) {
          chosenExercises.push(iso);
          addedNames.add(iso);
          break; // 1 isolation per group in pass 2
        }
      }
    }
  });

  // Pass 3: If still room under maxTotal, fill from remaining
  if (chosenExercises.length < maxTotal) {
    for (const bp of validParts) {
      const pool = BODY_PART_POOLS[bp] || BODY_PART_POOLS.chest;
      const combined = [...pool.compound, ...pool.isolation];
      for (const ex of combined) {
        if (!addedNames.has(ex) && chosenExercises.length < maxTotal) {
          chosenExercises.push(ex);
          addedNames.add(ex);
        }
      }
    }
  }

  return chosenExercises.map((name) => ({
    name,
    targetSets: sets,
    targetReps: reps,
    targetWeight: 0,
    targetUnit: userUnit,
    notes: '',
  }));
}

export default function SuggestedWorkoutModal({
  isOpen,
  onClose,
  userUnit,
  onStartWorkout,
  onSavePlan,
}: SuggestedWorkoutModalProps) {
  const toast = useToast();

  // Mode: 'bodyparts' | 'split'
  const [activeTab, setActiveTab] = useState<'bodyparts' | 'split'>('bodyparts');

  // Multi-select body parts
  const [selectedBodyParts, setSelectedBodyParts] = useState<BodyPartOption[]>(['chest', 'arms']);
  const [selectedIntensity, setSelectedIntensity] = useState<IntensityOption>('medium');

  // Split selection state
  const [selectedSplitId, setSelectedSplitId] = useState<string>('ppl');
  const [selectedSplitDayIdx, setSelectedSplitDayIdx] = useState<number>(0);

  // Custom Split state
  const [isCreatingCustomSplit, setIsCreatingCustomSplit] = useState(false);
  const [customSplitName, setCustomSplitName] = useState('My Custom Split');
  const [customSplitDays, setCustomSplitDays] = useState<{ name: string; bodyParts: BodyPartOption[] }[]>([
    { name: 'Day 1: Chest & Triceps', bodyParts: ['chest', 'arms'] },
    { name: 'Day 2: Back & Biceps', bodyParts: ['back', 'arms'] },
    { name: 'Day 3: Legs & Shoulders', bodyParts: ['legs', 'shoulders'] },
  ]);

  // Plan editor state
  const [planTitle, setPlanTitle] = useState('');
  const [exercises, setExercises] = useState<PlannedExercise[]>([]);

  // Search & quick add exercise
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [showAddDrawer, setShowAddDrawer] = useState(false);

  const allAvailableExercises = useMemo(() => getExerciseList(), []);

  // Filtered exercises for add drawer
  const filteredAvailableExercises = useMemo(() => {
    let list = allAvailableExercises;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((e) => e.toLowerCase().includes(q));
    }
    return list.slice(0, 15);
  }, [allAvailableExercises, searchQuery]);

  // Toggle body part selection
  const handleToggleBodyPart = (id: BodyPartOption) => {
    setSelectedBodyParts((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((p) => p !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // Generate exercises based on chosen body parts and intensity
  const generateExercises = (bodyParts: BodyPartOption[], intensity: IntensityOption): PlannedExercise[] => {
    return generateExercisesFromSelection(bodyParts, intensity, userUnit);
  };

  // Re-generate routine on changes
  useEffect(() => {
    if (!isOpen) return;

    if (activeTab === 'bodyparts') {
      const names = selectedBodyParts.map((bp) => BODY_PARTS.find((b) => b.id === bp)?.label || bp).join(' + ');
      setPlanTitle(`${names} (${INTENSITIES.find((i) => i.id === selectedIntensity)?.label})`);
      setExercises(generateExercisesFromSelection(selectedBodyParts, selectedIntensity, userUnit));
    } else {
      // Split mode
      const split = SPLIT_PRESETS.find((s) => s.id === selectedSplitId);
      const day = split?.days[selectedSplitDayIdx] || split?.days[0];
      if (day) {
        setPlanTitle(day.name);
        setExercises(generateExercisesFromSelection(day.bodyParts, selectedIntensity, userUnit));
      }
    }
  }, [isOpen, activeTab, selectedBodyParts, selectedIntensity, selectedSplitId, selectedSplitDayIdx, userUnit]);

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

  const handleQuickAddExercise = (exerciseName: string) => {
    if (exercises.some((e) => e.name.toLowerCase() === exerciseName.toLowerCase())) {
      toast.info(`${exerciseName} is already in the routine.`);
      return;
    }
    setExercises((prev) => [
      ...prev,
      {
        name: exerciseName,
        targetSets: 3,
        targetReps: 10,
        targetUnit: userUnit,
        notes: '',
      },
    ]);
    setShowAddDrawer(false);
    toast.success(`Added ${exerciseName} to routine!`);
  };

  const handleStartNow = () => {
    const valid = exercises.filter((e) => e.name.trim());
    if (valid.length === 0) {
      toast.error('Please include at least one named exercise.');
      return;
    }
    onStartWorkout(planTitle || 'Suggested Workout', valid);
    onClose();
  };

  const handleSaveToPlans = () => {
    const valid = exercises.filter((e) => e.name.trim());
    if (valid.length === 0) {
      toast.error('Please include at least one named exercise.');
      return;
    }
    onSavePlan({
      name: planTitle || 'Suggested Routine',
      exercises: valid,
    });
    onClose();
  };

  const currentSplit = SPLIT_PRESETS.find((s) => s.id === selectedSplitId) || SPLIT_PRESETS[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-xl w-full max-h-[90vh] overflow-hidden p-0 bg-bg-card border border-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-bg-elevated/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/20 text-accent flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary leading-tight font-sans">
                Workout Plan Generator
              </h2>
              <p className="text-2xs text-text-secondary">
                Select multiple body parts or choose your training split
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: Multi Body Parts vs Split */}
        <div className="px-4 pt-3 flex gap-2 border-b border-border bg-bg-secondary/40 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('bodyparts')}
            className={`pb-2.5 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'bodyparts'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Multi-Body Parts</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('split')}
            className={`pb-2.5 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'split'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Choose Split Routine</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* ── MODE 1: MULTI-BODY PART SELECTION ── */}
          {activeTab === 'bodyparts' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase font-bold text-text-muted tracking-wider">
                  Target Body Parts (Select Multiple)
                </span>
                <span className="text-2xs text-accent font-bold font-mono">
                  {selectedBodyParts.length} selected
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {BODY_PARTS.map((bp) => {
                  const isSelected = selectedBodyParts.includes(bp.id);
                  return (
                    <button
                      key={bp.id}
                      type="button"
                      onClick={() => handleToggleBodyPart(bp.id)}
                      className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all select-none active:scale-95 ${
                        isSelected
                          ? 'bg-accent/15 border-accent text-accent shadow-xs'
                          : 'bg-bg-secondary border-border/80 text-text-secondary hover:border-accent/40'
                      }`}
                    >
                      <span className="text-base">{bp.icon}</span>
                      <div className="min-w-0 flex-1">
                        <span className={`text-xs block font-bold truncate ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                          {bp.label}
                        </span>
                        <span className="text-[10px] text-text-muted truncate block">
                          {bp.description}
                        </span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── MODE 2: SPLIT SELECTION ── */}
          {activeTab === 'split' && (
            <div className="space-y-3">
              <span className="text-[10px] font-mono uppercase font-bold text-text-muted tracking-wider block">
                Choose Split Template
              </span>

              {/* Split Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SPLIT_PRESETS.map((s) => {
                  const isSelected = selectedSplitId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedSplitId(s.id);
                        setSelectedSplitDayIdx(0);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-accent/15 border-accent text-accent shadow-xs'
                          : 'bg-bg-secondary border-border/80 text-text-secondary hover:border-accent/40'
                      }`}
                    >
                      <span className={`text-xs font-bold block ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                        {s.name}
                      </span>
                      <span className="text-2xs text-text-muted line-clamp-1 mt-0.5">
                        {s.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Day selection within chosen split */}
              <div className="pt-1 space-y-1.5">
                <span className="text-2xs font-mono font-bold text-text-secondary uppercase block">
                  Select Day to Train:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {currentSplit.days.map((day, idx) => {
                    const isDaySelected = selectedSplitDayIdx === idx;
                    return (
                      <button
                        key={day.name}
                        type="button"
                        onClick={() => setSelectedSplitDayIdx(idx)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                          isDaySelected
                            ? 'bg-accent text-white border-accent shadow-xs'
                            : 'bg-bg-secondary border-border text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {day.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Intensity Selector */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-mono uppercase font-bold text-text-muted tracking-wider block">
              Intensity & Target Volume
            </span>
            <div className="grid grid-cols-3 gap-2">
              {INTENSITIES.map((int) => {
                const isSelected = selectedIntensity === int.id;
                return (
                  <button
                    key={int.id}
                    type="button"
                    onClick={() => setSelectedIntensity(int.id)}
                    className={`p-2 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'bg-accent/15 border-accent text-accent shadow-xs'
                        : 'bg-bg-secondary border-border text-text-secondary hover:border-accent/40'
                    }`}
                  >
                    <span className="text-xs font-bold block">{int.label}</span>
                    <span className="text-[9px] text-text-muted font-mono block mt-0.5 truncate">
                      {int.tag}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Routine Preview & Exercise List */}
          <div className="pt-2 space-y-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <input
                  type="text"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  placeholder="Workout Plan Name"
                  className="font-bold text-sm text-text-primary bg-transparent border-b border-border/80 focus:border-accent outline-none pb-0.5"
                />
                <span className="text-2xs text-text-muted block mt-0.5 font-mono">
                  {exercises.length} exercises configured
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowAddDrawer(!showAddDrawer)}
                className="btn-secondary py-1 px-2.5 text-2xs font-semibold flex items-center gap-1 border-accent/40 text-accent hover:bg-accent/10"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Exercise</span>
              </button>
            </div>

            {/* Quick Add Drawer */}
            {showAddDrawer && (
              <div className="p-3 rounded-xl bg-bg-secondary border border-accent/40 space-y-2 animate-fade-in">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search exercise (e.g. Bench, Curl, Squat)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-bg-card border border-border rounded-lg text-text-primary outline-none focus:border-accent font-sans"
                    autoFocus
                  />
                </div>

                <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
                  {filteredAvailableExercises.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleQuickAddExercise(name)}
                      className="px-2 py-1 rounded-lg bg-bg-card border border-border hover:border-accent text-2xs font-medium text-text-primary flex items-center gap-1 active:scale-95 transition-all"
                    >
                      <Plus className="w-2.5 h-2.5 text-accent" />
                      <span>{name}</span>
                    </button>
                  ))}
                  {filteredAvailableExercises.length === 0 && (
                    <p className="text-2xs text-text-muted py-2 w-full text-center">
                      No matching exercises found.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Exercise Rows */}
            <div className="space-y-1.5">
              {exercises.map((ex, idx) => (
                <div
                  key={`${ex.name}-${idx}`}
                  className="p-2.5 rounded-xl bg-bg-secondary/60 border border-border flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-5 h-5 rounded-full bg-bg-elevated flex items-center justify-center text-[10px] font-mono font-bold text-text-muted shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-text-primary truncate">
                      {ex.name}
                    </span>
                  </div>

                  {/* Steppers for Sets & Reps */}
                  <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                    <div className="flex items-center gap-1 bg-bg-card px-2 py-1 rounded-lg border border-border">
                      <span className="text-text-muted text-[10px]">Sets:</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateExercise(idx, 'targetSets', Math.max(1, ex.targetSets - 1))}
                        className="px-1 text-text-muted hover:text-text-primary"
                      >
                        -
                      </button>
                      <span className="font-bold text-text-primary">{ex.targetSets}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateExercise(idx, 'targetSets', ex.targetSets + 1)}
                        className="px-1 text-text-muted hover:text-text-primary"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center gap-1 bg-bg-card px-2 py-1 rounded-lg border border-border">
                      <span className="text-text-muted text-[10px]">Reps:</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateExercise(idx, 'targetReps', Math.max(1, ex.targetReps - 1))}
                        className="px-1 text-text-muted hover:text-text-primary"
                      >
                        -
                      </button>
                      <span className="font-bold text-text-primary">{ex.targetReps}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateExercise(idx, 'targetReps', ex.targetReps + 1)}
                        className="px-1 text-text-muted hover:text-text-primary"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveExercise(idx)}
                      className="p-1 text-text-muted hover:text-danger transition-colors"
                      title="Remove exercise"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-border bg-bg-elevated/70 flex gap-2">
          <button
            type="button"
            onClick={handleSaveToPlans}
            className="btn-secondary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <BookmarkPlus className="w-4 h-4 text-accent" />
            <span>Save to Plans</span>
          </button>
          <button
            type="button"
            onClick={handleStartNow}
            className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-accent/25"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Start Workout</span>
          </button>
        </div>
      </div>
    </div>
  );
}
