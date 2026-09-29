'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import {
  getLiftLevel,
  getOverallLevel,
  getExerciseList,
  getExercisesByCategory,
  calculateOneRepMax,
  getNextMilestone,
  getNextLevelInfo,
  isBodyweightExercise,
  isDumbbellExercise,
} from '@/lib/strength-standards';
import {
  Plus,
  Trash2,
  X,
  Target,
  Edit3,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  ArrowLeft,
  Search,
  TrendingUp,
  BarChart2,
  Layers,
  Activity,
} from 'lucide-react';
import RankBadge from '@/components/ui/RankBadge';
import ProgressChart from '@/components/ProgressChart';
import ThemeToggle from '@/components/ui/ThemeToggle';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import CircularProgress from '@/components/ui/CircularProgress';
import { useToast } from '@/components/ui/Toast';
import { ExerciseRank } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PRsPageProps {
  onNavigate?: (tab: 'home' | 'prs' | 'workout' | 'meals') => void;
}

// ─── Rank tier configuration ──────────────────────────────────────────────────

const RANK_TIERS: { rank: ExerciseRank; label: string; range: string; min: number; max: number }[] = [
  { rank: 'FOUNDATION',  label: 'Foundation',  range: '1–15',   min: 1,   max: 15  },
  { rank: 'TRAINED',     label: 'Trained',     range: '16–30',  min: 16,  max: 30  },
  { rank: 'SKILLED',     label: 'Skilled',     range: '31–45',  min: 31,  max: 45  },
  { rank: 'ADVANCED',    label: 'Advanced',    range: '46–65',  min: 46,  max: 65  },
  { rank: 'ELITE',       label: 'Elite',       range: '66–80',  min: 66,  max: 80  },
  { rank: 'MASTER',      label: 'Master',      range: '81–95',  min: 81,  max: 95  },
  { rank: 'GRANDMASTER', label: 'Grandmaster', range: '96+',    min: 96,  max: 999 },
];

const RANK_COLORS: Record<ExerciseRank, string> = {
  FOUNDATION:  'text-text-muted   border-border         bg-bg-secondary',
  TRAINED:     'text-text-secondary border-border-hover  bg-bg-elevated',
  SKILLED:     'text-info          border-info/40        bg-info/10',
  ADVANCED:    'text-warning       border-warning/50     bg-warning/10',
  ELITE:       'text-accent        border-accent/70      bg-accent/15',
  MASTER:      'text-accent        border-accent         bg-accent/20',
  GRANDMASTER: 'text-accent        border-accent         bg-gradient-to-r from-accent/20 via-warning/25 to-accent/20',
};

// ─── Category pill config ──────────────────────────────────────────────────────

const CATEGORY_PILL: Record<string, { label: string; color: string }> = {
  'Barbell Compounds': { label: 'BB',    color: 'bg-accent/20 text-accent' },
  'Dumbbell':          { label: 'DB',    color: 'bg-info/20 text-info' },
  'Bodyweight':        { label: 'BW',    color: 'bg-warning/20 text-warning' },
  'Cable & Machine':   { label: 'CM',    color: 'bg-text-muted/20 text-text-secondary' },
};

// ─── Custom Exercise Dropdown ─────────────────────────────────────────────────

interface ExerciseDropdownProps {
  value: string;
  onChange: (val: string) => void;
}

function ExerciseDropdown({ value, onChange }: ExerciseDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => getExercisesByCategory(), []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return grouped;
    return grouped
      .map((g) => ({
        ...g,
        exercises: g.exercises.filter((ex) => ex.toLowerCase().includes(q)),
      }))
      .filter((g) => g.exercises.length > 0);
  }, [search, grouped]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search when opened
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  // Find category for selected value
  const selectedCategory = useMemo(() => {
    for (const g of grouped) {
      if (g.exercises.includes(value)) return g.category;
    }
    return value === 'Custom' ? null : null;
  }, [value, grouped]);

  const displayLabel = value === 'Custom' ? 'Custom Exercise...' : value || 'Select an exercise...';
  const pill = selectedCategory ? CATEGORY_PILL[selectedCategory] : null;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-border bg-bg-card text-sm text-left hover:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {pill && (
            <span className={`text-2xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${pill.color}`}>
              {pill.label}
            </span>
          )}
          <span className={`truncate ${value ? 'text-text-primary' : 'text-text-muted'}`}>
            {displayLabel}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-bg-card shadow-2xl overflow-hidden animate-fade-in">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-bg-secondary border border-border">
              <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search exercises..."
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none border-none p-0"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-text-muted hover:text-text-primary">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.map((group) => {
              const pillCfg = CATEGORY_PILL[group.category];
              return (
                <div key={group.category}>
                  <div className="px-3 py-1.5 flex items-center gap-2">
                    <span className={`text-2xs font-mono font-bold px-1.5 py-0.5 rounded ${pillCfg?.color || 'bg-bg-secondary text-text-muted'}`}>
                      {pillCfg?.label || group.category.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">
                      {group.category}
                    </span>
                  </div>
                  {group.exercises.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => {
                        onChange(ex);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-accent/10 transition-colors ${
                        value === ex ? 'bg-accent/15 text-accent font-semibold' : 'text-text-primary'
                      }`}
                    >
                      <span className={`text-2xs font-mono px-1 py-0.5 rounded ${pillCfg?.color || ''} opacity-60`}>
                        {pillCfg?.label}
                      </span>
                      {ex}
                    </button>
                  ))}
                </div>
              );
            })}

            {/* Custom option */}
            <div className="border-t border-border mt-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  onChange('Custom');
                  setOpen(false);
                  setSearch('');
                }}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-accent/10 transition-colors ${
                  value === 'Custom' ? 'bg-accent/15 text-accent font-semibold' : 'text-text-secondary'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Custom Exercise...
              </button>
            </div>

            {filtered.length === 0 && !search.trim() && (
              <p className="text-xs text-text-muted text-center py-4">No exercises found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Level Progression Modal ──────────────────────────────────────────────────

interface LevelModalProps {
  exercise: string;
  levelInfo: ReturnType<typeof getLiftLevel>;
  bodyweightKg: number;
  gender: 'male' | 'female';
  userUnit: 'kg' | 'lbs';
  onClose: () => void;
}

function LevelProgressionModal({
  exercise,
  levelInfo,
  bodyweightKg,
  gender,
  userUnit,
  onClose,
}: LevelModalProps) {
  const nextInfo = useMemo(
    () => getNextLevelInfo(exercise, levelInfo.level, bodyweightKg, gender),
    [exercise, levelInfo.level, bodyweightKg, gender]
  );

  const currentLevel = levelInfo.level;
  const currentRank = levelInfo.rank;

  // How far through [0,100] are we within the current rank tier?
  const tier = RANK_TIERS.find((t) => t.rank === currentRank)!;
  const tierProgressPct = tier
    ? Math.min(100, Math.max(0, ((currentLevel - tier.min) / (tier.max - tier.min)) * 100))
    : 0;

  const requiredDisplay =
    userUnit === 'lbs'
      ? Math.round(nextInfo.requiredRatioKg * 2.20462 * 10) / 10
      : nextInfo.requiredRatioKg;

  const isBW = isBodyweightExercise(exercise);
  const isDB = isDumbbellExercise(exercise);
  const unitLabel = isBW ? 'kg added' : isDB ? `${userUnit}/hand` : userUnit;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content p-0 overflow-hidden max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center bg-gradient-to-r from-bg-card to-bg-secondary">
          <div>
            <h3 className="font-bold text-text-primary text-base capitalize leading-tight">{exercise}</h3>
            <p className="text-2xs text-text-muted font-mono mt-0.5">Level Progression</p>
          </div>
          <button onClick={onClose} className="text-text-muted p-1 hover:text-text-primary rounded">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Current status */}
          <div className="flex items-center justify-between gap-4">
            <div className="text-center">
              <span className="text-3xl font-extrabold text-accent font-mono">{currentLevel}</span>
              <p className="text-2xs text-text-muted font-mono">CURRENT LV</p>
            </div>
            <div className="flex-1 flex flex-col items-center gap-1">
              <RankBadge rank={currentRank} size="md" />
              <p className="text-2xs text-text-muted font-mono">{levelInfo.ratio}x BW ratio</p>
            </div>
            <div className="text-center">
              <span className="text-3xl font-extrabold text-text-secondary font-mono">{nextInfo.nextLevel}</span>
              <p className="text-2xs text-text-muted font-mono">NEXT LV</p>
            </div>
          </div>

          {/* Next level requirement */}
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-text-primary">To reach Level {nextInfo.nextLevel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xs text-text-muted font-mono">Required 1RM</span>
              <span className="text-base font-bold text-accent font-mono">
                {requiredDisplay} {userUnit}
                {isDB && <span className="text-2xs ml-1 text-text-muted">/hand</span>}
              </span>
            </div>
            {nextInfo.levelsToNextRank > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-2xs text-text-muted font-mono">Levels to next rank tier</span>
                <span className="text-sm font-bold text-warning font-mono">{nextInfo.levelsToNextRank}</span>
              </div>
            )}
          </div>

          {/* Progress bar within current tier */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-2xs text-text-muted font-mono">
              <span>{currentRank} Tier Progress</span>
              <span>{Math.round(tierProgressPct)}%</span>
            </div>
            <div className="level-bar">
              <div
                className="level-bar-fill"
                style={{ width: `${tierProgressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-2xs text-text-muted font-mono">
              <span>LV {tier.min}</span>
              <span>LV {tier.max === 999 ? '96+' : tier.max}</span>
            </div>
          </div>

          {/* All 7 rank tiers */}
          <div className="space-y-1.5">
            <p className="section-title">ALL RANK TIERS</p>
            <div className="space-y-1">
              {RANK_TIERS.map((t) => {
                const isCurrent = t.rank === currentRank;
                const isPassed = currentLevel > t.max && t.max !== 999;
                const isGM = t.rank === 'GRANDMASTER';
                const gmPassed = isGM && currentLevel >= t.min;
                const passed = isPassed || gmPassed;

                return (
                  <div
                    key={t.rank}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                      isCurrent
                        ? `border-accent/60 bg-accent/10 ring-1 ring-accent/20`
                        : passed
                        ? 'border-border/40 bg-bg-secondary/40 opacity-60'
                        : 'border-border/20 bg-bg-secondary/20 opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isCurrent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 animate-pulse" />
                      )}
                      {!isCurrent && passed && (
                        <span className="w-1.5 h-1.5 rounded-full bg-text-muted/40 shrink-0" />
                      )}
                      {!isCurrent && !passed && (
                        <span className="w-1.5 h-1.5 rounded-full border border-border shrink-0" />
                      )}
                      <RankBadge rank={t.rank} size="sm" />
                    </div>
                    <span className={`text-2xs font-mono font-semibold ${isCurrent ? 'text-accent' : 'text-text-muted'}`}>
                      LV {t.range}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PRsPage({ onNavigate }: PRsPageProps = {}) {
  const { profile, prs, workouts, prTargets, addPR, deletePR, setPRTarget } = useStore();
  const userUnit = profile?.unit || 'kg';
  const bodyweightKg = profile?.bodyweightKg || 75;
  const gender = profile?.gender || 'male';
  const toast = useToast();

  // ── Existing state ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [targetModalExercise, setTargetModalExercise] = useState<string | null>(null);
  const [targetWeightInput, setTargetWeightInput] = useState('');
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [plateModalWeight, setPlateModalWeight] = useState<number | null>(null);
  const [plateModalMeta, setPlateModalMeta] = useState<{
    exerciseName?: string;
    bestSetWeight?: number;
    milestoneWeight?: number;
  } | null>(null);

  // ── New: level modal state ──
  const [levelModalExercise, setLevelModalExercise] = useState<string | null>(null);

  // ── Form state ──
  const [exercise, setExercise] = useState('');
  const [customExercise, setCustomExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lbs'>(userUnit);
  const [reps, setReps] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const availableExercises = getExerciseList();

  // Derived: is the currently selected exercise a bodyweight one?
  const selectedExerciseName = exercise === 'Custom' ? customExercise.trim() : exercise;
  const selectedIsBodyweight = isBodyweightExercise(selectedExerciseName);
  const selectedIsDumbbell = isDumbbellExercise(selectedExerciseName);

  // ─── handleSavePR ────────────────────────────────────────────────────────────

  const handleSavePR = () => {
    const finalExercise = exercise === 'Custom' ? customExercise.trim() : exercise;
    if (!finalExercise) {
      toast.error('Please select or specify an exercise name.', 'Missing Exercise');
      return;
    }

    const repsNum = parseInt(reps, 10);
    if (isNaN(repsNum) || repsNum <= 0) {
      toast.error('Reps count must be at least 1.', 'Invalid Reps');
      return;
    }

    const isBW = isBodyweightExercise(finalExercise);
    const weightStr = weight.trim();

    // Bodyweight exercise: weight is optional
    if (isBW) {
      const addedWeightNum = weightStr === '' || weightStr === '0' ? 0 : parseFloat(weightStr);
      if (weightStr !== '' && weightStr !== '0' && isNaN(addedWeightNum)) {
        toast.error('Added weight must be a valid number.', 'Invalid Weight');
        return;
      }

      let addedKg = 0;
      let addedLbs = 0;
      if (addedWeightNum > 0) {
        if (unit === 'lbs') {
          addedLbs = addedWeightNum;
          addedKg = addedWeightNum * 0.453592;
        } else {
          addedKg = addedWeightNum;
          addedLbs = addedWeightNum * 2.20462;
        }
      }

      // 1RM for bodyweight exercise = bodyweight + added weight (for Epley)
      const totalFormulaKg = bodyweightKg + addedKg;
      const oneRepMaxKg = calculateOneRepMax(totalFormulaKg, repsNum);

      addPR({
        id: crypto.randomUUID(),
        exercise: finalExercise,
        weightKg: Math.round(addedKg * 10) / 10,
        weightLbs: Math.round(addedLbs * 10) / 10,
        reps: repsNum,
        oneRepMax: Math.round(oneRepMaxKg * 10) / 10,
        date,
        notes: notes.trim() || undefined,
      });

      const displayStr =
        addedWeightNum > 0
          ? `+${addedWeightNum} ${unit} × ${repsNum}`
          : `Bodyweight × ${repsNum}`;
      toast.success(
        `${finalExercise}: ${displayStr} (${Math.round(oneRepMaxKg)} kg 1RM)`,
        'PR Logged'
      );
    } else {
      // Standard exercise: weight required
      if (!weightStr) {
        toast.error('Please enter the weight lifted.', 'Missing Weight');
        return;
      }
      const weightNum = parseFloat(weightStr);
      if (isNaN(weightNum) || weightNum <= 0) {
        toast.error('Weight lifted must be greater than zero.', 'Invalid Weight');
        return;
      }

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
        notes: notes.trim() || undefined,
      });

      toast.success(
        `${finalExercise}: ${weightNum} ${unit} × ${repsNum} (${Math.round(oneRepMaxKg)} kg 1RM)`,
        'PR Logged'
      );
    }

    setShowAddModal(false);
    setExercise('');
    setCustomExercise('');
    setWeight('');
    setReps('1');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  // ─── handleSaveTarget ─────────────────────────────────────────────────────────

  const handleSaveTarget = () => {
    if (!targetModalExercise || !targetWeightInput) return;
    const targetVal = parseFloat(targetWeightInput);
    if (isNaN(targetVal) || targetVal <= 0) {
      toast.error('Please enter a target weight greater than zero.', 'Invalid Target');
      return;
    }

    const targetKg = userUnit === 'lbs' ? targetVal * 0.453592 : targetVal;
    setPRTarget(targetModalExercise, Math.round(targetKg * 10) / 10);
    toast.success(
      `Next milestone target for ${targetModalExercise} set to ${targetVal} ${userUnit}.`,
      'Target Updated'
    );

    setTargetModalExercise(null);
    setTargetWeightInput('');
  };

  // ─── Exercise stats (memoized) ────────────────────────────────────────────────

  const exerciseStats = useMemo(() => {
    const groups = new Map<
      string,
      {
        exercise: string;
        prs: typeof prs;
        bestPR: (typeof prs)[0];
        best1RMKg: number;
        bestSet: { weight: number; reps: number; unit: string; isBodyweight: boolean };
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
          bestSet: { weight: 0, reps: 0, unit: userUnit, isBodyweight: false },
          levelInfo: null as any,
          sessionsCount: 0,
          nextMilestone: 0,
          milestoneProgress: 0,
        });
      }

      const g = groups.get(ex)!;
      g.prs.push(pr);

      const pr1RMKg = calculateOneRepMax(pr.weightKg, pr.reps);
      if (pr1RMKg > g.best1RMKg) {
        g.best1RMKg = pr1RMKg;
        g.bestPR = pr;
        const dispW = userUnit === 'lbs' ? pr.weightLbs : pr.weightKg;
        g.bestSet = {
          weight: dispW,
          reps: pr.reps,
          unit: userUnit,
          isBodyweight: isBodyweightExercise(ex) && pr.weightKg === 0,
        };
      }
    });

    // Compute per-group derived values
    groups.forEach((g, ex) => {
      g.prs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      g.sessionsCount = workouts.filter((w) =>
        w.exercises.some((e) => e.name.toLowerCase() === ex.toLowerCase())
      ).length;

      g.levelInfo = getLiftLevel(
        ex,
        g.best1RMKg,
        bodyweightKg,
        gender
      );

      const best1RMUserUnit = userUnit === 'lbs' ? g.best1RMKg * 2.20462 : g.best1RMKg;
      const customTargetKg = prTargets?.[ex];
      const customTargetUserUnit = customTargetKg
        ? userUnit === 'lbs'
          ? customTargetKg * 2.20462
          : customTargetKg
        : undefined;

      const milestone = getNextMilestone(best1RMUserUnit, customTargetUserUnit);
      g.nextMilestone = Math.round(milestone * 10) / 10;

      if (g.nextMilestone > 0) {
        g.milestoneProgress = Math.min(
          100,
          Math.max(0, Math.round((best1RMUserUnit / g.nextMilestone) * 100))
        );
      }
    });

    return Array.from(groups.values()).sort(
      (a, b) => (b.levelInfo?.level || 0) - (a.levelInfo?.level || 0)
    );
  }, [prs, workouts, bodyweightKg, gender, prTargets, userUnit]);

  // ─── Overall level ────────────────────────────────────────────────────────────

  const overallLevel = useMemo(() => {
    const levels = exerciseStats.map((e) => e.levelInfo).filter(Boolean);
    if (levels.length > 0) {
      return getOverallLevel(levels);
    }
    return null;
  }, [exerciseStats]);

  // ─── Level modal data ─────────────────────────────────────────────────────────

  const levelModalData = useMemo(() => {
    if (!levelModalExercise) return null;
    return exerciseStats.find((s) => s.exercise === levelModalExercise) || null;
  }, [levelModalExercise, exerciseStats]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="page animate-fade-in space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
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
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
              Personal Records
            </h1>
            <p className="text-2xs text-text-muted font-mono">Ranked by real bodyweight standards</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setPlateModalWeight(100);
              setPlateModalMeta(null);
            }}
            className="p-2 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
            title="Barbell Plate Calculator"
          >
            <Dumbbell className="w-4 h-4 text-accent" />
          </button>
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
        <div className="card space-y-3 bg-bg-card border border-border">
          <div className="flex justify-between items-start">
            <div>
              <span className="section-title text-[11px]">OVERALL STRENGTH</span>
              <div className="flex items-baseline gap-2.5 mt-1">
                <span className="text-3xl font-black text-accent font-sans">
                  LV {overallLevel.level}
                </span>
                <span className="text-base font-bold text-text-primary tracking-tight font-sans">
                  {overallLevel.title}
                </span>
              </div>
            </div>
            <RankBadge
              rank={
                overallLevel.level <= 15
                  ? 'FOUNDATION'
                  : overallLevel.level <= 30
                  ? 'TRAINED'
                  : overallLevel.level <= 45
                  ? 'SKILLED'
                  : overallLevel.level <= 65
                  ? 'ADVANCED'
                  : overallLevel.level <= 80
                  ? 'ELITE'
                  : overallLevel.level <= 95
                  ? 'MASTER'
                  : 'GRANDMASTER'
              }
              size="sm"
            />
          </div>

          <div className="level-bar">
            <div
              className="level-bar-fill"
              style={{ width: `${Math.min(100, Math.max(2, overallLevel.level))}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-text-muted">
            <span className="font-medium text-text-secondary">{exerciseStats.length} Lifts Ranked</span>
            <span>Strength Ratio: <strong className="text-text-primary">{overallLevel.averageRatio}× BW</strong></span>
          </div>
        </div>
      )}

      {/* Progress Chart */}
      <ProgressChart />

      {/* Lift Cards List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">YOUR LIFTS &amp; MILESTONES</h2>
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
            const isBWExercise = isBodyweightExercise(item.exercise);

            return (
              <div
                key={item.exercise}
                className="card p-4 space-y-3 transition-all duration-150 hover:border-border-hover bg-bg-card border border-border"
              >
                {/* 1. Exercise Name & Prominent 1RM Value (Item 11) */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-text-primary capitalize leading-tight font-sans">
                      {item.exercise}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setLevelModalExercise(item.exercise)}
                        className="text-xs font-bold text-accent hover:underline flex items-center gap-1 font-sans"
                        title="View level progression"
                      >
                        <span>LV {item.levelInfo.level}</span>
                        <span>•</span>
                        <span>{item.levelInfo.rank}</span>
                      </button>
                      <span className="text-text-muted text-2xs">•</span>
                      <span className="text-2xs text-text-muted font-medium">
                        {item.levelInfo.ratio}× BW
                      </span>
                      {isBWExercise && (
                        <span className="text-2xs px-1 rounded bg-warning/15 text-warning font-semibold">
                          BW
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-2xl font-black text-text-primary font-sans leading-none block">
                      {display1RM}{' '}
                      <span className="text-xs font-normal text-text-muted">{userUnit}</span>
                    </span>
                    <span className="text-[10px] text-text-muted font-mono uppercase block mt-0.5">
                      Estimated 1RM
                    </span>
                  </div>
                </div>

                {/* 2. Next Milestone Progress Bar (Item 11) */}
                <div className="space-y-1 pt-0.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-muted flex items-center gap-1 font-medium">
                      <Target className="w-3.5 h-3.5 text-accent" />
                      <span>Next milestone: <strong>{item.nextMilestone} {userUnit}</strong></span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetModalExercise(item.exercise);
                          setTargetWeightInput(item.nextMilestone.toString());
                        }}
                        className="text-2xs text-text-muted hover:text-accent underline"
                        title="Set target"
                      >
                        Edit Target
                      </button>
                      <span className="font-bold text-text-primary text-xs font-mono">
                        {item.milestoneProgress}%
                      </span>
                    </div>
                  </div>

                  <div className="level-bar h-2">
                    <div
                      className="level-bar-fill"
                      style={{ width: `${item.milestoneProgress}%` }}
                    />
                  </div>
                </div>

                {/* 3. Best Set & Plate Calculator Link (Item 11) */}
                <div className="flex items-center justify-between pt-1 text-xs text-text-secondary border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => {
                      if (item.bestSet.weight > 0 || isBWExercise) {
                        setPlateModalWeight(
                          isBWExercise && item.bestSet.weight === 0
                            ? (userUnit === 'lbs' ? bodyweightKg * 2.20462 : bodyweightKg)
                            : item.bestSet.weight
                        );
                        setPlateModalMeta({
                          exerciseName: item.exercise,
                          bestSetWeight:
                            isBWExercise && item.bestSet.weight === 0
                              ? (userUnit === 'lbs' ? bodyweightKg * 2.20462 : bodyweightKg)
                              : item.bestSet.weight,
                          milestoneWeight: item.nextMilestone || display1RM,
                        });
                      }
                    }}
                    className="flex items-center gap-1.5 hover:text-accent font-medium group text-left"
                    title="Tap to calculate barbell plates"
                  >
                    <Dumbbell className="w-3.5 h-3.5 text-accent" />
                    <span>
                      Best set:{' '}
                      <strong className="text-text-primary group-hover:text-accent">
                        {item.bestSet.isBodyweight
                          ? `BW × ${item.bestSet.reps}`
                          : `${item.bestSet.weight} ${userUnit} × ${item.bestSet.reps}`}
                      </strong>
                    </span>
                  </button>

                  <span className="text-2xs text-text-muted">
                    {item.prs.length} PRs • {item.sessionsCount} sessions
                  </span>
                </div>

                {/* 4. Expand / View PR History Drawer (Item 11) */}
                <div className="border-t border-border/60 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedExercise(isExpanded ? null : item.exercise)
                    }
                    className="w-full flex items-center justify-between text-xs text-text-muted hover:text-text-primary py-1 font-medium transition-colors"
                  >
                    <span>PR History ({item.prs.length})</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 animate-fade-in">
                      {item.prs.map((p) => {
                        const w = userUnit === 'lbs' ? p.weightLbs : p.weightKg;
                        const isBWRecord = isBodyweightExercise(p.exercise) && p.weightKg === 0;
                        const single1RM = calculateOneRepMax(
                          isBWRecord ? bodyweightKg : w,
                          p.reps
                        );
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-bg-secondary border border-border text-xs font-mono"
                          >
                            <div>
                              <span className="font-bold text-text-primary">
                                {isBWRecord ? 'Bodyweight' : `${w} ${userUnit}`} × {p.reps} reps
                              </span>
                              <div className="text-2xs text-text-muted flex gap-2 mt-0.5">
                                <span>
                                  e1RM: {Math.round(single1RM * 10) / 10} {userUnit}
                                </span>
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
                              onClick={() => {
                                deletePR(p.id);
                                toast.info(
                                  `Deleted ${p.exercise} record from ${p.date}.`,
                                  'PR Removed'
                                );
                              }}
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

      {/* ── Level Progression Modal ── */}
      {levelModalExercise && levelModalData && (
        <LevelProgressionModal
          exercise={levelModalExercise}
          levelInfo={levelModalData.levelInfo}
          bodyweightKg={bodyweightKg}
          gender={gender}
          userUnit={userUnit}
          onClose={() => setLevelModalExercise(null)}
        />
      )}

      {/* ── Target Milestone Modal ── */}
      {targetModalExercise && (
        <div className="modal-overlay" onClick={() => setTargetModalExercise(null)}>
          <div className="modal-content p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="font-bold text-text-primary text-base">Set Target Milestone</h3>
              <button onClick={() => setTargetModalExercise(null)} className="text-text-muted p-1">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-text-secondary">
              Set your next target 1RM for{' '}
              <span className="text-accent font-semibold">{targetModalExercise}</span>.
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
              <button onClick={handleSaveTarget} className="btn-primary flex-1 text-xs">
                Save Target
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add PR Modal ── */}
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
              {/* Exercise selector — custom dropdown */}
              <div>
                <label className="section-title mb-1.5 block">EXERCISE</label>
                <ExerciseDropdown
                  value={exercise}
                  onChange={(val) => {
                    setExercise(val);
                    // Reset weight when switching to bodyweight
                    if (isBodyweightExercise(val)) setWeight('');
                  }}
                />
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

              {/* Weight & Reps */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="section-title mb-1.5 block">
                    {selectedIsBodyweight
                      ? 'ADDED WEIGHT (OPTIONAL)'
                      : selectedIsDumbbell
                      ? 'WEIGHT (PER HAND)'
                      : 'WEIGHT'}
                  </label>
                  <div className="flex">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder={selectedIsBodyweight ? '0 (bodyweight)' : '0'}
                      required={!selectedIsBodyweight}
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
                  {selectedIsBodyweight && (
                    <p className="text-2xs text-text-muted mt-1 font-mono">
                      Leave 0 or blank for pure bodyweight ({Math.round(bodyweightKg)} kg)
                    </p>
                  )}
                  {selectedIsDumbbell && (
                    <p className="text-2xs text-text-muted mt-1 font-mono">Per-hand weight</p>
                  )}
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

              {/* Date */}
              <div>
                <label className="section-title mb-1.5 block">DATE</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="section-title mb-1.5 block">NOTES (OPTIONAL)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="RPE, bar speed, cue, beltless..."
                  className="w-full h-18 resize-none text-sm"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="btn-ghost flex-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePR}
                  disabled={
                    !reps ||
                    (!exercise && !customExercise.trim()) ||
                    // For non-bodyweight: weight must be present
                    (!selectedIsBodyweight && !weight)
                  }
                  className="btn-primary flex-1 disabled:opacity-40 text-xs"
                >
                  Save Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Barbell Plate Calculator Modal ── */}
      <PlateCalculatorModal
        isOpen={plateModalWeight !== null}
        onClose={() => {
          setPlateModalWeight(null);
          setPlateModalMeta(null);
        }}
        initialWeight={plateModalWeight || 100}
        initialUnit={userUnit}
        exerciseName={plateModalMeta?.exerciseName}
        bestSetWeight={plateModalMeta?.bestSetWeight}
        milestoneWeight={plateModalMeta?.milestoneWeight}
      />
    </div>
  );
}
