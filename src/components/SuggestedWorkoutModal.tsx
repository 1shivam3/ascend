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
  Repeat,
  Target,
  Box,
  Crown,
  Activity,
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
  defaultIntensity?: IntensityOption;
  onStartWorkout: (workoutName: string, exercises: PlannedExercise[]) => void;
  onSavePlan: (plan: Omit<PlannedWorkout, 'id' | 'createdAt'>) => void;
}

const BODY_PARTS: { id: BodyPartOption; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { id: 'chest',      label: 'Chest',       icon: Target,   description: 'Pectorals & Incline' },
  { id: 'back',       label: 'Back',        icon: Layers,   description: 'Lats, Traps & Rhomboids' },
  { id: 'shoulders',  label: 'Shoulders',   icon: Shield,   description: 'Delts & Overhead' },
  { id: 'arms',       label: 'Arms',        icon: Dumbbell, description: 'Biceps & Triceps' },
  { id: 'legs',       label: 'Legs',        icon: Activity, description: 'Quads, Hamstrings & Calves' },
  { id: 'core',       label: 'Core / Abs',  icon: Box,      description: 'Abs & Stability' },
  { id: 'push',       label: 'Push Day',    icon: Flame,    description: 'Chest, Shoulders & Triceps' },
  { id: 'pull',       label: 'Pull Day',    icon: Zap,      description: 'Back, Biceps & Rear Delts' },
  { id: 'full_body',  label: 'Full Body',   icon: Crown,    description: 'Compound Total Body' },
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
    description: '3-day or 6-day split grouping push, pull, and leg movements.',
    days: [
      { name: 'Push Day (Chest & Triceps)', bodyParts: ['push'] },
      { name: 'Pull Day (Back & Biceps)', bodyParts: ['pull'] },
      { name: 'Leg Day (Quads & Posterior)', bodyParts: ['legs', 'core'] },
    ],
  },
  {
    id: 'upper_lower',
    name: 'Upper / Lower',
    description: 'High-frequency 4-day split alternating upper body and lower body.',
    days: [
      { name: 'Upper A (Bench & Row)', bodyParts: ['chest', 'back', 'shoulders'] },
      { name: 'Lower A (Squat & Quads)', bodyParts: ['legs', 'core'] },
      { name: 'Upper B (Incline & OHP)', bodyParts: ['shoulders', 'chest', 'back'] },
      { name: 'Lower B (Deadlift & Posterior)', bodyParts: ['legs', 'core'] },
    ],
  },
  {
    id: 'arnold',
    name: 'Arnold Split',
    description: 'Agonist & antagonist pairing for balanced upper body and arm development.',
    days: [
      { name: 'Chest & Back', bodyParts: ['chest', 'back'] },
      { name: 'Shoulders & Arms', bodyParts: ['shoulders', 'arms'] },
      { name: 'Legs & Abs', bodyParts: ['legs', 'core'] },
    ],
  },
  {
    id: 'bro_split',
    name: 'Targeted Bodypart Split',
    description: 'Focused 5-day split targeting one primary muscle group per session.',
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
      { name: 'Full Body A', bodyParts: ['full_body'] },
      { name: 'Full Body B', bodyParts: ['full_body'] },
    ],
  },
];

const INTENSITIES: { id: IntensityOption; label: string; tag: string; description: string; badgeColor: string }[] = [
  {
    id: 'low',
    label: 'Low',
    tag: 'Deload / Recovery / Form',
    description: '4 exercises • 2–3 sets • 12–15 reps • Focus on technique',
    badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  },
  {
    id: 'medium',
    label: 'Medium',
    tag: 'Hypertrophy & Muscle Growth',
    description: '5 exercises • 3–4 sets • 8–10 reps • Balanced progressive overload',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  {
    id: 'high',
    label: 'High',
    tag: 'Maximum Strength',
    description: '5 exercises • 4–5 sets • 4–6 reps (compounds) • Peak neural drive',
    badgeColor: 'text-accent bg-accent/10 border-accent/30',
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
    isolation: ['Face Pull', 'Cable Row', 'Dumbbell Row', 'Straight Arm Pulldown'],
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
    compound: ['Bench Press', 'Overhead Press', 'Incline Bench', 'Dips'],
    isolation: ['Chest Fly', 'Dumbbell Lateral Raise', 'Tricep Pushdown'],
  },
  pull: {
    compound: ['Deadlift', 'Barbell Row', 'Pull-ups', 'Lat Pulldown'],
    isolation: ['Face Pull', 'Dumbbell Curl', 'Hammer Curl', 'Cable Row'],
  },
  full_body: {
    compound: ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull-ups'],
    isolation: ['Dumbbell Lateral Raise', 'Dumbbell Curl', 'Tricep Pushdown', 'Calf Raise'],
  },
};

const ALL_COMPOUND_NAMES = new Set<string>();
Object.values(BODY_PART_POOLS).forEach((p) => p.compound.forEach((c) => ALL_COMPOUND_NAMES.add(c)));

export function generateExercisesFromSelection(
  bodyParts: BodyPartOption[],
  intensity: IntensityOption = 'medium',
  userUnit: 'kg' | 'lbs' = 'kg'
): PlannedExercise[] {
  const isHigh = intensity === 'high';
  const isLow = intensity === 'low';

  // Strict target count: 4 for low (deload), exactly 5 for medium & high
  const maxTotal = isLow ? 4 : 5;
  const validParts = bodyParts.length > 0 ? bodyParts : (['full_body'] as BodyPartOption[]);

  const selectedExercises: string[] = [];
  const added = new Set<string>();

  const addEx = (name: string) => {
    if (!added.has(name) && selectedExercises.length < maxTotal) {
      selectedExercises.push(name);
      added.add(name);
      return true;
    }
    return false;
  };

  // Specific handling for pure 'push' routine
  if (validParts.length === 1 && validParts[0] === 'push') {
    // 1. Primary chest compound
    addEx('Bench Press');
    // 2. Primary shoulder compound
    addEx('Overhead Press');
    // 3. Secondary chest (incline)
    addEx('Incline Bench');
    // 4. Chest isolation
    addEx('Chest Fly');
    // 5. Lateral raise or triceps
    addEx('Dumbbell Lateral Raise');
    if (selectedExercises.length < maxTotal) {
      addEx('Tricep Pushdown');
    }
  } else if (validParts.length === 1 && validParts[0] === 'pull') {
    // 1. Primary back compound
    addEx('Barbell Row');
    // 2. Primary vertical pull
    addEx('Lat Pulldown');
    // 3. Heavy hinge / deadlift
    addEx('Deadlift');
    // 4. Rear delt / posture
    addEx('Face Pull');
    // 5. Bicep isolation
    addEx('Dumbbell Curl');
  } else {
    // Generic multi-body part allocation
    const hasArms = validParts.includes('arms');

    // Step 1: Ensure primary compound for each non-arm body part first
    for (const bp of validParts) {
      if (bp === 'arms') continue;
      const pool = BODY_PART_POOLS[bp] || BODY_PART_POOLS.chest;
      for (const c of pool.compound) {
        if (addEx(c)) break;
      }
    }

    // Step 2: If arms is explicitly selected (and not push), guarantee tricep & bicep
    if (hasArms && !validParts.includes('push')) {
      const biceps = ['Dumbbell Curl', 'Hammer Curl', 'Preacher Curl'];
      for (const b of biceps) {
        if (addEx(b)) break;
      }
      const triceps = ['Tricep Pushdown', 'Skull Crushers', 'Dips'];
      for (const t of triceps) {
        if (addEx(t)) break;
      }
    }

    // Step 3: Add second compound or primary accessory for each body part
    for (const bp of validParts) {
      if (selectedExercises.length >= maxTotal) break;
      const pool = BODY_PART_POOLS[bp] || BODY_PART_POOLS.chest;
      for (const c of pool.compound) {
        if (addEx(c)) break;
      }
      for (const iso of pool.isolation) {
        if (addEx(iso)) break;
      }
    }

    // Step 4: Fill remaining slots if still below maxTotal
    if (selectedExercises.length < maxTotal) {
      for (const bp of validParts) {
        const pool = BODY_PART_POOLS[bp] || BODY_PART_POOLS.chest;
        for (const iso of pool.isolation) {
          addEx(iso);
          if (selectedExercises.length >= maxTotal) break;
        }
        if (selectedExercises.length >= maxTotal) break;
      }
    }
  }

  // Sort exercises: heavy primary compounds first, then accessories & isolations
  const priorityLifts = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Incline Bench', 'Pull-ups', 'Front Squat', 'Romanian Deadlift'];
  selectedExercises.sort((a, b) => {
    const aPri = priorityLifts.indexOf(a);
    const bPri = priorityLifts.indexOf(b);
    if (aPri !== -1 && bPri !== -1) return aPri - bPri;
    if (aPri !== -1) return -1;
    if (bPri !== -1) return 1;

    const aComp = ALL_COMPOUND_NAMES.has(a);
    const bComp = ALL_COMPOUND_NAMES.has(b);
    if (aComp && !bComp) return -1;
    if (!aComp && bComp) return 1;
    return 0;
  });

  return selectedExercises.map((name) => {
    const isCompound = ALL_COMPOUND_NAMES.has(name);
    // Calibrated sets & reps:
    // High (Maximum Strength): compounds 4-5 sets x 3-5 reps; accessories 3-4 sets x 6 reps
    // Medium (Hypertrophy): compounds 3-4 sets x 8 reps; accessories 3 sets x 10 reps
    // Low (Deload/Endurance): 2-3 sets x 12 reps
    const targetSets = isHigh ? (isCompound ? 5 : 4) : isLow ? 2 : (isCompound ? 4 : 3);
    const targetReps = isHigh ? (isCompound ? 4 : 6) : isLow ? 12 : (isCompound ? 8 : 10);

    return {
      name,
      targetSets,
      targetReps,
      targetWeight: 0,
      targetUnit: userUnit,
      notes: '',
    };
  });
}

export default function SuggestedWorkoutModal({
  isOpen,
  onClose,
  userUnit,
  defaultIntensity = 'medium',
  onStartWorkout,
  onSavePlan,
}: SuggestedWorkoutModalProps) {
  const toast = useToast();

  // Mode: 'bodyparts' | 'split'
  const [activeTab, setActiveTab] = useState<'bodyparts' | 'split'>('bodyparts');

  // Multi-select body parts
  const [selectedBodyParts, setSelectedBodyParts] = useState<BodyPartOption[]>(['chest', 'arms']);
  const [selectedIntensity, setSelectedIntensity] = useState<IntensityOption>(defaultIntensity);

  // Sync intensity with user's primary goal when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedIntensity(defaultIntensity);
    }
  }, [isOpen, defaultIntensity]);

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
                <span className="text-label font-bold text-text-muted">
                  Target body parts (select multiple)
                </span>
                <span className="text-2xs text-accent font-bold font-mono">
                  {selectedBodyParts.length} selected
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {BODY_PARTS.map((bp) => {
                  const isSelected = selectedBodyParts.includes(bp.id);
                  const Icon = bp.icon;
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
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'bg-accent/25 text-accent' : 'bg-bg-card border border-border/60 text-text-muted'
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
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
                  <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                    <div className="flex items-center gap-1 bg-bg-card px-1.5 py-0.5 rounded-lg border border-border">
                      <span className="text-text-muted text-[10px] pl-1">Sets:</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateExercise(idx, 'targetSets', Math.max(1, ex.targetSets - 1))}
                        className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-secondary active:scale-95 transition-all text-sm font-bold"
                        aria-label="Decrease sets"
                      >
                        −
                      </button>
                      <span className="font-bold text-text-primary min-w-[16px] text-center">{ex.targetSets}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateExercise(idx, 'targetSets', ex.targetSets + 1)}
                        className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-secondary active:scale-95 transition-all text-sm font-bold"
                        aria-label="Increase sets"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center gap-1 bg-bg-card px-1.5 py-0.5 rounded-lg border border-border">
                      <span className="text-text-muted text-[10px] pl-1">Reps:</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateExercise(idx, 'targetReps', Math.max(1, ex.targetReps - 1))}
                        className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-secondary active:scale-95 transition-all text-sm font-bold"
                        aria-label="Decrease reps"
                      >
                        −
                      </button>
                      <span className="font-bold text-text-primary min-w-[16px] text-center">{ex.targetReps}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateExercise(idx, 'targetReps', ex.targetReps + 1)}
                        className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-secondary active:scale-95 transition-all text-sm font-bold"
                        aria-label="Increase reps"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveExercise(idx)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
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
        <div className="p-3.5 border-t border-border bg-bg-card flex gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleSaveToPlans}
            className="btn-secondary flex-1 py-2.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <BookmarkPlus className="w-4 h-4 text-accent" />
            <span>Save to Plans</span>
          </button>
          <button
            type="button"
            onClick={handleStartNow}
            className="btn-primary flex-1 py-2.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <Play className="w-4 h-4 fill-white stroke-white" />
            <span>Start Workout</span>
          </button>
        </div>
      </div>
    </div>
  );
}
