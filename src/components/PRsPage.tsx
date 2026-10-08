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
  isMainCompoundLift,
  getExerciseEquipment,
} from '@/lib/strength-standards';
import {
  Plus,
  Trash2,
  X,
  Target,
  Edit3,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Dumbbell,
  Search,
  TrendingUp,
  BarChart2,
  Layers,
  Activity,
  Filter,
  Sliders,
  Trophy,
  Zap,
  Award,
} from 'lucide-react';
import { getBigThreeStats, calculateDOTS } from '@/lib/dots';
import RankBadge from '@/components/ui/RankBadge';
import ProgressChart from '@/components/ProgressChart';
import PlateCalculatorModal from '@/components/PlateCalculatorModal';
import CircularProgress from '@/components/ui/CircularProgress';
import { useToast } from '@/components/ui/Toast';
import { ExerciseRank, EquipmentType } from '@/lib/types';
import { useAppNavigation } from '@/lib/navigation';
import { safeRandomId, getLocalTodayStr, formatLocalDate } from '@/lib/formatters';

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
  'Barbell Compounds': { label: 'BB',      color: 'bg-accent/20 text-accent' },
  'Dumbbell':          { label: 'DB',      color: 'bg-info/20 text-info' },
  'Bodyweight':        { label: 'BW',      color: 'bg-warning/20 text-warning' },
  'Cable':             { label: 'Cable',   color: 'bg-sky-500/20 text-sky-400' },
  'Machine':           { label: 'Machine', color: 'bg-emerald-500/20 text-emerald-400' },
  'Cable & Machine':   { label: 'CM',      color: 'bg-text-muted/20 text-text-secondary' },
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
          <button type="button" onClick={onClose} className="text-text-muted p-1 hover:text-text-primary rounded">
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

// ─── LiftCard Sub-Component ──────────────────────────────────────────────────

interface LiftCardProps {
  item: {
    exercise: string;
    prs: any[];
    bestPR: any;
    best1RMKg: number;
    bestSet: { weight: number; reps: number; unit: string; isBodyweight: boolean };
    levelInfo: any;
    sessionsCount: number;
    nextMilestone: number;
    milestoneProgress: number;
  };
  userUnit: 'kg' | 'lbs';
  bodyweightKg: number;
  isExpanded: boolean;
  prTypeFilter?: 'all' | '1rm' | 'reps';
  onToggleExpand: () => void;
  onOpenLevelModal: () => void;
  onOpenPlateModal: () => void;
  onOpenTargetModal: () => void;
  onDeletePR: (id: string, date: string, exercise: string) => void;
}

function LiftCard({
  item,
  userUnit,
  bodyweightKg,
  isExpanded,
  prTypeFilter = 'all',
  onToggleExpand,
  onOpenLevelModal,
  onOpenPlateModal,
  onOpenTargetModal,
  onDeletePR,
}: LiftCardProps) {
  const display1RM =
    userUnit === 'lbs'
      ? Math.round(item.best1RMKg * 2.20462 * 10) / 10
      : Math.round(item.best1RMKg * 10) / 10;
  const isMain = isMainCompoundLift(item.exercise);
  const toGo = Math.max(0, Math.round((item.nextMilestone - display1RM) * 10) / 10);
  const isBaselineLift = item.prs.length === 1 && (item.prs[0].isBaseline || item.prs[0].notes?.includes('Baseline'));

  const filteredPrList = useMemo(() => {
    if (!prTypeFilter || prTypeFilter === 'all') return item.prs;
    if (prTypeFilter === '1rm') return item.prs.filter((p) => p.prType === '1rm' || (!p.prType && p.reps === 1));
    return item.prs.filter((p) => p.prType === 'reps' || (!p.prType && p.reps > 1));
  }, [item.prs, prTypeFilter]);

  return (
    <div className="card p-4 space-y-3 transition-all duration-150 hover:border-border-hover bg-bg-card border border-border">
      {/* 1. Exercise Header & Prominent 1RM */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-text-primary capitalize leading-tight font-sans">
            {item.exercise}
          </h3>
          <p className="text-xs text-text-muted mt-1 flex items-center gap-1.5 flex-wrap">
            <span>
              Best:{' '}
              <strong className="text-text-primary font-medium">
                {item.bestSet.isBodyweight
                  ? `BW × ${item.bestSet.reps}`
                  : `${item.bestSet.weight} ${userUnit} × ${item.bestSet.reps}`}
              </strong>
            </span>
            {isBaselineLift && (
              <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-sans">
                Baseline
              </span>
            )}
          </p>
        </div>

        <div className="text-right shrink-0">
          <span className="text-2xl font-black text-text-primary font-sans leading-none block">
            {display1RM}{' '}
            <span className="text-xs font-normal text-text-muted">{userUnit}</span>
          </span>
          <span className="text-[10px] text-text-muted font-mono uppercase block mt-0.5">
            Estimated 1RM
          </span>
        </div>
      </div>

      {/* 2. Next Milestone Progress Bar */}
      <div className="space-y-1.5 pt-0.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-text-muted flex items-center gap-1 font-medium">
            <Target className="w-3.5 h-3.5 text-accent" />
            <span>
              Next milestone: <strong className="text-text-primary">{item.nextMilestone} {userUnit}</strong>
            </span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenTargetModal}
              className="text-2xs text-text-muted hover:text-accent underline"
              title="Set target"
            >
              Edit Target
            </button>
            <span className="font-bold text-accent text-xs font-mono tabular-nums">
              {toGo > 0 ? `${toGo} ${userUnit} to go` : 'Target reached!'}
            </span>
          </div>
        </div>

        <div className="level-bar h-1.5">
          <div
            className="level-bar-fill"
            style={{ width: `${item.milestoneProgress}%` }}
          />
        </div>
      </div>

      {/* 3. Action Bar: View History Toggle & Plate Calculator */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-text-muted hover:text-text-primary font-medium flex items-center gap-1.5 transition-colors py-0.5"
        >
          <span>{isExpanded ? 'Hide History' : 'View History'}</span>
          <span className="text-2xs font-mono text-text-muted">
            ({item.prs.length} {item.prs.length === 1 ? 'PR' : 'PRs'})
          </span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <button
          type="button"
          onClick={onOpenPlateModal}
          className="text-2xs text-text-muted hover:text-accent font-medium flex items-center gap-1 py-0.5"
          title="Tap to calculate barbell plates"
        >
          <Dumbbell className="w-3 h-3 text-accent" />
          <span>Plate Calc</span>
        </button>
      </div>

      {/* 4. Expand / View PR History Drawer */}
      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-2.5 animate-fade-in">
          {/* Secondary stats row */}
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-bg-secondary border border-border text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenLevelModal}
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
                title="View tier progression"
              >
                <span>Level {item.levelInfo.level}</span>
                <span>•</span>
                <span>{item.levelInfo.rank}</span>
              </button>
              <span className="text-text-muted text-2xs">•</span>
              <span className="text-2xs text-text-muted font-mono">{item.levelInfo.ratio}× BW</span>
            </div>
            {isMain && (
              <span className="text-3xs font-mono font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/25 uppercase">
                Core Lift
              </span>
            )}
          </div>

          <div className="space-y-2">
            {filteredPrList.map((p) => {
              const w = userUnit === 'lbs' ? p.weightLbs : p.weightKg;
              const isBWRecord = isBodyweightExercise(p.exercise) && p.weightKg === 0;
              const single1RM = calculateOneRepMax(
                isBWRecord ? bodyweightKg : w,
                p.reps
              );
              const isAllTimePeak = item.bestPR?.id === p.id;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-2.5 rounded-lg text-xs font-mono transition-all ${
                    isAllTimePeak
                      ? 'border-l-4 border-l-accent bg-accent/10 border-accent/40 shadow-xs'
                      : 'border border-border bg-bg-secondary'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-text-primary">
                        {isBWRecord ? 'Bodyweight' : `${w} ${userUnit}`} × {p.reps} reps
                      </span>
                      {isAllTimePeak && (
                        <span className="text-[9px] font-sans font-black text-accent bg-accent/20 px-1.5 py-0.5 rounded border border-accent/40 flex items-center gap-1 shadow-2xs">
                          <Trophy className="w-2.5 h-2.5 text-accent" />
                          <span>All-Time Record</span>
                        </span>
                      )}
                      {p.prType === 'reps' && (
                        <span className="text-[9px] font-sans font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded border border-accent/25 flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-accent fill-accent" />
                          <span>Rep PR</span>
                        </span>
                      )}
                      {(p.prType === '1rm' || (!p.prType && p.reps === 1)) && (
                        <span className="text-[9px] font-sans font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded border border-accent/25 flex items-center gap-1">
                          <Award className="w-2.5 h-2.5 text-accent" />
                          <span>1RM PR</span>
                        </span>
                      )}
                      {(p.isBaseline || p.notes?.includes('Baseline')) && (
                        <span className="text-[9px] font-sans font-semibold text-amber-500 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20">
                          Baseline
                        </span>
                      )}
                    </div>
                    <div className="text-2xs text-text-muted flex gap-2 mt-0.5">
                      <span>
                        e1RM: {Math.round(single1RM * 10) / 10} {userUnit}
                      </span>
                      <span>•</span>
                      <span>{formatLocalDate(p.date)}</span>
                    </div>
                    {p.notes && (
                      <p className="text-2xs text-text-secondary italic mt-0.5">
                        &quot;{p.notes}&quot;
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeletePR(p.id, p.date, p.exercise)}
                    className="text-text-muted hover:text-danger p-1 rounded hover:bg-danger/10 transition-colors"
                    title="Delete record"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
  const { goBack, canGoBack, registerBackHandler } = useAppNavigation();

  const bigThreeStats = useMemo(() => getBigThreeStats(prs || []), [prs]);
  const dotsScore = useMemo(() => {
    if (!profile || !profile.bodyweightKg || bigThreeStats.totalKg === 0) return 0;
    return calculateDOTS(profile.bodyweightKg, bigThreeStats.totalKg, profile.gender);
  }, [profile, bigThreeStats.totalKg]);

  const displayWeight = (kg: number) => {
    if (userUnit === 'lbs') {
      return `${Math.round(kg * 2.20462)} lbs`;
    }
    return `${Math.round(kg * 10) / 10} kg`;
  };

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

  // ── Modal Back Handlers (Interconnected Navigation) ──
  useEffect(() => {
    if (showAddModal) {
      return registerBackHandler(() => { setShowAddModal(false); return true; }, 100);
    }
  }, [showAddModal, registerBackHandler]);

  useEffect(() => {
    if (levelModalExercise) {
      return registerBackHandler(() => { setLevelModalExercise(null); return true; }, 100);
    }
  }, [levelModalExercise, registerBackHandler]);

  useEffect(() => {
    if (plateModalWeight !== null) {
      return registerBackHandler(() => { setPlateModalWeight(null); setPlateModalMeta(null); return true; }, 100);
    }
  }, [plateModalWeight, registerBackHandler]);

  useEffect(() => {
    if (targetModalExercise) {
      return registerBackHandler(() => { setTargetModalExercise(null); return true; }, 100);
    }
  }, [targetModalExercise, registerBackHandler]);

  // ── Equipment filter and show-more state ──
  const [selectedEquipmentFilter, setSelectedEquipmentFilter] = useState<'all' | EquipmentType>('all');
  const [prTypeFilter, setPrTypeFilter] = useState<'all' | '1rm' | 'reps'>('all');
  const [showAllOtherLifts, setShowAllOtherLifts] = useState(false);

  // ── Form state ──
  const [exercise, setExercise] = useState('');
  const [customExercise, setCustomExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lbs'>(userUnit);
  const [reps, setReps] = useState('1');
  const [date, setDate] = useState(getLocalTodayStr());
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
        id: safeRandomId('pr'),
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
        id: safeRandomId('pr'),
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
    setDate(getLocalTodayStr());
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

      const isBW = isBodyweightExercise(ex);
      const effectiveWeight = isBW ? (bodyweightKg + (pr.weightKg || 0)) : pr.weightKg;
      const pr1RMKg = (pr.oneRepMax && pr.oneRepMax > 0) ? pr.oneRepMax : calculateOneRepMax(effectiveWeight, pr.reps);
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

  // ─── Partition lifts & Equipment / PR Type Filters ───────────────────────────

  const filteredStats = useMemo(() => {
    let stats = exerciseStats;
    if (prTypeFilter === '1rm') {
      stats = stats.filter((e) => e.prs.some((p) => p.prType === '1rm' || (!p.prType && p.reps === 1)));
    } else if (prTypeFilter === 'reps') {
      stats = stats.filter((e) => e.prs.some((p) => p.prType === 'reps' || (!p.prType && p.reps > 1)));
    }
    if (selectedEquipmentFilter === 'all') return stats;
    return stats.filter(
      (e) => getExerciseEquipment(e.exercise) === selectedEquipmentFilter
    );
  }, [exerciseStats, selectedEquipmentFilter, prTypeFilter]);

  const mainCompoundLifts = useMemo(() => {
    return filteredStats.filter((e) => isMainCompoundLift(e.exercise));
  }, [filteredStats]);

  const otherLifts = useMemo(() => {
    return filteredStats.filter((e) => !isMainCompoundLift(e.exercise));
  }, [filteredStats]);

  const equipmentCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: exerciseStats.length,
      barbell: 0,
      dumbbell: 0,
      cable: 0,
      bodyweight: 0,
      machine: 0,
    };
    exerciseStats.forEach((e) => {
      const eq = getExerciseEquipment(e.exercise);
      if (counts[eq] !== undefined) counts[eq]++;
    });
    return counts;
  }, [exerciseStats]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="page animate-fade-in space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {canGoBack && (
            <button
              type="button"
              onClick={goBack}
              className="p-1.5 -ml-1 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card border border-border/50 hover:border-accent/40 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              aria-label="Go back to previous page"
              title="Go back"
            >
              <ChevronLeft className="w-5 h-5 text-accent" />
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
          <button
            type="button"
            className="btn-primary flex items-center gap-1.5"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} />
            <span>Add PR</span>
          </button>
        </div>
      </div>

      {/* Powerlifting Scoreboard (Clean, Real Big 3 & DOTS) */}
      {bigThreeStats.totalKg > 0 && (
        <div className="card space-y-3 bg-bg-card border border-border">
          <div className="flex justify-between items-baseline">
            <div>
              <span className="section-title text-[11px] mb-0 font-sans">
                {profile?.goals?.includes('get_stronger') ? 'POWERLIFTING SCOREBOARD' : 'KEY COMPOUND LIFTS TOTAL'}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-accent font-sans tabular-nums">
                  {displayWeight(bigThreeStats.totalKg)}
                </span>
                <span className="text-sm font-semibold text-text-primary">
                  {profile?.goals?.includes('get_stronger') ? 'Big 3 Total' : 'Combined Compound Total'}
                </span>
              </div>
            </div>
            <div className="text-right">
              {profile?.goals?.includes('get_stronger') && dotsScore > 0 ? (
                <>
                  <span className="text-base font-bold text-accent tabular-nums font-mono block">
                    {Math.round(dotsScore)} DOTS
                  </span>
                  <span className="text-3xs text-text-muted block">Normalized Score</span>
                </>
              ) : (
                <>
                  <span className="text-base font-bold text-accent tabular-nums font-mono block">
                    {exerciseStats.length} Lifts
                  </span>
                  <span className="text-3xs text-text-muted block">Calibrated PRs</span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-bg-secondary text-center">
            <div>
              <span className="text-xs font-bold text-text-secondary block">Squat</span>
              <span className="text-sm font-black text-text-primary mt-0.5 block tabular-nums">
                {bigThreeStats.squatMax > 0 ? displayWeight(bigThreeStats.squatMax) : '—'}
              </span>
              {profile?.bodyweightKg && bigThreeStats.squatMax > 0 && (
                <span className="text-3xs text-text-muted font-mono block mt-0.5">
                  {(bigThreeStats.squatMax / profile.bodyweightKg).toFixed(2)}× BW
                </span>
              )}
            </div>
            <div className="border-l border-border">
              <span className="text-xs font-bold text-text-secondary block">Bench</span>
              <span className="text-sm font-black text-text-primary mt-0.5 block tabular-nums">
                {bigThreeStats.benchMax > 0 ? displayWeight(bigThreeStats.benchMax) : '—'}
              </span>
              {profile?.bodyweightKg && bigThreeStats.benchMax > 0 && (
                <span className="text-3xs text-text-muted font-mono block mt-0.5">
                  {(bigThreeStats.benchMax / profile.bodyweightKg).toFixed(2)}× BW
                </span>
              )}
            </div>
            <div className="border-l border-border">
              <span className="text-xs font-bold text-text-secondary block">Deadlift</span>
              <span className="text-sm font-black text-text-primary mt-0.5 block tabular-nums">
                {bigThreeStats.deadliftMax > 0 ? displayWeight(bigThreeStats.deadliftMax) : '—'}
              </span>
              {profile?.bodyweightKg && bigThreeStats.deadliftMax > 0 && (
                <span className="text-3xs text-text-muted font-mono block mt-0.5">
                  {(bigThreeStats.deadliftMax / profile.bodyweightKg).toFixed(2)}× BW
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Progress Chart */}
      <ProgressChart />

      {/* Lift Cards List */}
      <div className="space-y-4">
        {/* PR Type Filter Tabs (All / 1RM Maxes / Rep Milestones) */}
        {prs.length > 0 && (
          <div className="flex items-center bg-bg-card border border-border/80 rounded-xl p-1 gap-1 shadow-xs">
            {[
              { id: 'all', label: 'All PRs', count: prs.length },
              { id: '1rm', label: '1RM Maxes', count: prs.filter((p) => p.prType === '1rm' || (!p.prType && p.reps === 1)).length },
              { id: 'reps', label: 'Rep Milestones', count: prs.filter((p) => p.prType === 'reps' || (!p.prType && p.reps > 1)).length },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPrTypeFilter(tab.id as any)}
                className={`flex-1 py-1.5 px-2 rounded-lg text-2xs font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
                  prTypeFilter === tab.id
                    ? 'bg-accent text-bg-primary font-black shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] font-mono ${prTypeFilter === tab.id ? 'opacity-80' : 'opacity-50'}`}>
                  ({tab.count})
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h2 className="section-title mb-0 font-sans">YOUR LIFTS &amp; MILESTONES</h2>
            <p className="text-2xs text-text-muted mt-0.5 font-sans">
              {mainCompoundLifts.length} Core Compound Lifts • {otherLifts.length} Accessory Exercises
            </p>
          </div>

          {/* Equipment Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'all', label: 'All Lifts', count: exerciseStats.length, icon: null },
              { id: 'barbell', label: 'Barbell', count: equipmentCounts.barbell, icon: Dumbbell },
              { id: 'dumbbell', label: 'Dumbbell', count: equipmentCounts.dumbbell, icon: Activity },
              { id: 'cable', label: 'Cable', count: equipmentCounts.cable, icon: Layers },
              { id: 'bodyweight', label: 'Bodyweight', count: equipmentCounts.bodyweight, icon: Target },
              { id: 'machine', label: 'Machine', count: equipmentCounts.machine, icon: Sliders },
            ]
              .filter((chip) => chip.id === 'all' || chip.count > 0)
              .map((chip) => {
                const Icon = chip.icon;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setSelectedEquipmentFilter(chip.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-2xs font-bold border transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                      selectedEquipmentFilter === chip.id
                        ? 'bg-accent/15 border-accent text-accent'
                        : 'bg-bg-card border-border text-text-secondary hover:border-accent/40'
                    }`}
                  >
                    {Icon && <Icon className="w-3 h-3 text-accent shrink-0" />}
                    <span>{chip.label}</span>
                    <span className="text-3xs opacity-75 font-mono">({chip.count})</span>
                  </button>
                );
              })}
          </div>
        </div>

        {exerciseStats.length === 0 ? (
          <div className="card text-center py-12">
            <Target className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
            <p className="text-text-secondary text-sm">No personal records logged yet.</p>
            <p className="text-xs text-text-muted mt-1">
              Tap &quot;Add PR&quot; above to calibrate your first lift and discover your rank.
            </p>
          </div>
        ) : filteredStats.length === 0 ? (
          <div className="card text-center py-12 space-y-2">
            <Filter className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
            <p className="text-text-secondary text-sm">No records found for this filter combination.</p>
            <button
              type="button"
              onClick={() => {
                setSelectedEquipmentFilter('all');
                setPrTypeFilter('all');
              }}
              className="btn-secondary text-xs py-1.5 px-3 mx-auto"
            >
              Clear Filters
            </button>
          </div>
        ) : selectedEquipmentFilter !== 'all' ? (
          // Specific equipment filter view: render all matching lifts
          <div className="space-y-3">
            {filteredStats.map((item) => (
              <LiftCard
                key={item.exercise}
                item={item}
                userUnit={userUnit}
                bodyweightKg={bodyweightKg}
                isExpanded={expandedExercise === item.exercise}
                prTypeFilter={prTypeFilter}
                onToggleExpand={() =>
                  setExpandedExercise(expandedExercise === item.exercise ? null : item.exercise)
                }
                onOpenLevelModal={() => setLevelModalExercise(item.exercise)}
                onOpenPlateModal={() => {
                  const isBW = isBodyweightExercise(item.exercise);
                  setPlateModalWeight(
                    isBW && item.bestSet.weight === 0
                      ? (userUnit === 'lbs' ? bodyweightKg * 2.20462 : bodyweightKg)
                      : item.bestSet.weight
                  );
                  setPlateModalMeta({
                    exerciseName: item.exercise,
                    bestSetWeight:
                      isBW && item.bestSet.weight === 0
                        ? (userUnit === 'lbs' ? bodyweightKg * 2.20462 : bodyweightKg)
                        : item.bestSet.weight,
                    milestoneWeight: item.nextMilestone,
                  });
                }}
                onOpenTargetModal={() => {
                  setTargetModalExercise(item.exercise);
                  setTargetWeightInput(item.nextMilestone.toString());
                }}
                onDeletePR={(id, date, ex) => {
                  deletePR(id);
                  toast.info(`Deleted ${ex} record from ${date}.`, 'PR Removed');
                }}
              />
            ))}
          </div>
        ) : (
          // "All" view: Main compound lifts first, then collapsible "Show More" for other lifts
          <div className="space-y-5">
            {/* 1. Main Compound Lifts Section */}
            {mainCompoundLifts.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-0.5">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-accent" />
                    <h3 className="section-title text-[11px] mb-0">MAIN COMPOUND LIFTS</h3>
                  </div>
                  <span className="text-2xs font-bold px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-accent font-mono">
                    {mainCompoundLifts.length} Core Lifts
                  </span>
                </div>

                <div className="space-y-3">
                  {mainCompoundLifts.map((item) => (
                    <LiftCard
                      key={item.exercise}
                      item={item}
                      userUnit={userUnit}
                      bodyweightKg={bodyweightKg}
                      isExpanded={expandedExercise === item.exercise}
                      prTypeFilter={prTypeFilter}
                      onToggleExpand={() =>
                        setExpandedExercise(expandedExercise === item.exercise ? null : item.exercise)
                      }
                      onOpenLevelModal={() => setLevelModalExercise(item.exercise)}
                      onOpenPlateModal={() => {
                        const isBW = isBodyweightExercise(item.exercise);
                        setPlateModalWeight(
                          isBW && item.bestSet.weight === 0
                            ? (userUnit === 'lbs' ? bodyweightKg * 2.20462 : bodyweightKg)
                            : item.bestSet.weight
                        );
                        setPlateModalMeta({
                          exerciseName: item.exercise,
                          bestSetWeight:
                            isBW && item.bestSet.weight === 0
                              ? (userUnit === 'lbs' ? bodyweightKg * 2.20462 : bodyweightKg)
                              : item.bestSet.weight,
                          milestoneWeight: item.nextMilestone,
                        });
                      }}
                      onOpenTargetModal={() => {
                        setTargetModalExercise(item.exercise);
                        setTargetWeightInput(item.nextMilestone.toString());
                      }}
                      onDeletePR={(id, date, ex) => {
                        deletePR(id);
                        toast.info(`Deleted ${ex} record from ${date}.`, 'PR Removed');
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 2. Other Exercises Section with "Show More" Accordion */}
            {otherLifts.length > 0 && (
              <div className="space-y-3 pt-1">
                {mainCompoundLifts.length > 0 ? (
                  // If main compound lifts exist, wrap others in a collapsible accordion
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setShowAllOtherLifts((prev) => !prev)}
                      className="w-full p-3.5 rounded-xl bg-bg-card border border-border hover:border-accent/40 flex items-center justify-between transition-colors group text-left shadow-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted group-hover:text-accent transition-colors">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-text-primary group-hover:text-accent block">
                            Other Exercises &amp; Accessories ({otherLifts.length})
                          </span>
                          <span className="text-2xs text-text-muted">
                            Dumbbell, cable, machine &amp; accessory PRs
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-lg border border-accent/20">
                        <span>{showAllOtherLifts ? 'Show Less' : `Show More (${otherLifts.length})`}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            showAllOtherLifts ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {showAllOtherLifts && (
                      <div className="space-y-3 animate-fade-in">
                        {otherLifts.map((item) => (
                          <LiftCard
                            key={item.exercise}
                            item={item}
                            userUnit={userUnit}
                            bodyweightKg={bodyweightKg}
                            isExpanded={expandedExercise === item.exercise}
                            prTypeFilter={prTypeFilter}
                            onToggleExpand={() =>
                              setExpandedExercise(
                                expandedExercise === item.exercise ? null : item.exercise
                              )
                            }
                            onOpenLevelModal={() => setLevelModalExercise(item.exercise)}
                            onOpenPlateModal={() => {
                              const isBW = isBodyweightExercise(item.exercise);
                              setPlateModalWeight(
                                isBW && item.bestSet.weight === 0
                                  ? (userUnit === 'lbs' ? bodyweightKg * 2.20462 : bodyweightKg)
                                  : item.bestSet.weight
                              );
                              setPlateModalMeta({
                                exerciseName: item.exercise,
                                bestSetWeight:
                                  isBW && item.bestSet.weight === 0
                                    ? (userUnit === 'lbs' ? bodyweightKg * 2.20462 : bodyweightKg)
                                    : item.bestSet.weight,
                                milestoneWeight: item.nextMilestone,
                              });
                            }}
                            onOpenTargetModal={() => {
                              setTargetModalExercise(item.exercise);
                              setTargetWeightInput(item.nextMilestone.toString());
                            }}
                            onDeletePR={(id, date, ex) => {
                              deletePR(id);
                              toast.info(`Deleted ${ex} record from ${date}.`, 'PR Removed');
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  // If no main compound lifts have been logged yet, show other lifts directly
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-0.5">
                      <h3 className="section-title text-[11px] mb-0">LOGGED EXERCISES</h3>
                      <span className="text-2xs text-text-muted">{otherLifts.length} Logged</span>
                    </div>
                    {otherLifts.map((item) => (
                      <LiftCard
                        key={item.exercise}
                        item={item}
                        userUnit={userUnit}
                        bodyweightKg={bodyweightKg}
                        isExpanded={expandedExercise === item.exercise}
                        onToggleExpand={() =>
                          setExpandedExercise(expandedExercise === item.exercise ? null : item.exercise)
                        }
                        onOpenLevelModal={() => setLevelModalExercise(item.exercise)}
                        onOpenPlateModal={() => {
                          const isBW = isBodyweightExercise(item.exercise);
                          setPlateModalWeight(
                            isBW && item.bestSet.weight === 0
                              ? (userUnit === 'lbs' ? bodyweightKg * 2.20462 : bodyweightKg)
                              : item.bestSet.weight
                          );
                          setPlateModalMeta({
                            exerciseName: item.exercise,
                            bestSetWeight:
                              isBW && item.bestSet.weight === 0
                                ? (userUnit === 'lbs' ? bodyweightKg * 2.20462 : bodyweightKg)
                                : item.bestSet.weight,
                            milestoneWeight: item.nextMilestone,
                          });
                        }}
                        onOpenTargetModal={() => {
                          setTargetModalExercise(item.exercise);
                          setTargetWeightInput(item.nextMilestone.toString());
                        }}
                        onDeletePR={(id, date, ex) => {
                          deletePR(id);
                          toast.info(`Deleted ${ex} record from ${date}.`, 'PR Removed');
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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
              <button type="button" onClick={() => setTargetModalExercise(null)} className="text-text-muted p-1">
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
                className="w-full text-base font-mono font-bold tabular-nums"
                autoFocus
              />
              <span className="flex items-center px-4 rounded-lg bg-bg-secondary border border-border font-mono text-sm text-text-muted">
                {userUnit}
              </span>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTargetModalExercise(null)}
                className="btn-ghost flex-1 text-xs"
              >
                Cancel
              </button>
              <button type="button" onClick={handleSaveTarget} className="btn-primary flex-1 text-xs">
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
              <button type="button" onClick={() => setShowAddModal(false)} className="text-text-muted p-1">
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
                      className="w-full rounded-r-none font-mono font-bold text-base tabular-nums"
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
                    className="w-full font-mono font-bold text-base tabular-nums"
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
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-ghost flex-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
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
