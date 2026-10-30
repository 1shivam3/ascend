'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { tabListKeyDown } from '@/lib/tab-keyboard';
import { useStore } from '@/lib/store';
import { toUserMessage } from '@/lib/user-error';
import { isSetCompleted, BodyMetricEntry, WorkoutEntry, resolvePrimaryGoal } from '@/lib/types';
import {
  TrendingUp,
  Dumbbell,
  Trophy,
  Scale,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  Share2,
  SlidersHorizontal,
  Award,
  Activity,
  X,
  HelpCircle,
  Camera,
  Flame,
  Check,
} from 'lucide-react';
import { getBigThreeStats, calculateDOTS, getDOTSClassification } from '@/lib/dots';
import { calculateOneRepMax } from '@/lib/strength-standards';
import { exerciseNamesEqual, getExerciseHistorySessions } from '@/lib/lifter-twin';
import WorkoutHeatmap from '@/components/WorkoutHeatmap';
import MuscleVolumeSection from '@/components/MuscleVolumeSection';
import EmptyState from '@/components/ui/EmptyState';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { resolveSpotlightChart, SPOTLIGHT_CHARTS, SPOTLIGHT_CHART_NAME_KEYS } from '@/lib/spotlight';
import PRsPage from '@/components/PRsPage';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import MeetAttemptPlannerModal from '@/components/MeetAttemptPlannerModal';
import WeeklyRecapModal from '@/components/WeeklyRecapModal';
import { plural, safeRandomId, getLocalTodayStr, getWeekDateStrings } from '@/lib/formatters';
import { useAppNavigation } from '@/lib/navigation';
import { useToast } from '@/components/ui/Toast';
import { useTranslation, type StringKey } from '@/lib/i18n';
import { resizeAndCompressImage } from '@/lib/image-processing';
import ConfirmationModal from '@/components/ConfirmationModal';
import type { ProgressPhoto } from '@/lib/types';

function formatProgressDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-');
    if (y && m && d) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIdx = parseInt(m, 10) - 1;
      return `${months[monthIdx] || m} ${parseInt(d, 10)}, ${y}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

function formatShortDate(dateStr: string): string {
  try {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

function getLocalDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface DataPoint {
  x: number;
  y: number;
  val: number;
  dateStr: string;
}

function computeChartGeometry(
  values: { date: string; value: number }[],
  width: number,
  height: number,
  padX: number = 10,
  padY: number = 20
): {
  pathD: string;
  areaD: string;
  points: DataPoint[];
  min: number;
  max: number;
} {
  if (values.length === 0) {
    return { pathD: '', areaD: '', points: [], min: 0, max: 0 };
  }

  const rawVals = values.map((v) => v.value);
  let min = Math.min(...rawVals);
  let max = Math.max(...rawVals);

  if (min === max) {
    min = Math.max(0, min - 10);
    max = max + 10;
  } else {
    const pad = (max - min) * 0.15;
    min = Math.max(0, min - pad);
    max = max + pad;
  }

  const valRange = max - min || 1;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const points: DataPoint[] = values.map((item, idx) => {
    const x = values.length === 1
      ? padX + innerW / 2
      : padX + (idx / (values.length - 1)) * innerW;
    const norm = (item.value - min) / valRange;
    const y = padY + (1 - norm) * innerH;
    return { x, y, val: item.value, dateStr: item.date };
  });

  if (points.length === 1) {
    // A single data point is a DOT, not a full-width flat line (which
    // dishonestly implies a stable trend). Paths stay empty; the render
    // draws the point's circle.
    const p = points[0];
    return { pathD: '', areaD: '', points, min, max };
  }

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    pathD += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const lastP = points[points.length - 1];
  const firstP = points[0];
  const areaD = `${pathD} L ${lastP.x} ${height} L ${firstP.x} ${height} Z`;

  return { pathD, areaD, points, min, max };
}

/**
 * Date-based axis labels derived from the ACTUAL data points, not the
 * selected range. Returns up to 4 evenly-spaced "12 Oct" labels so the axis
 * never claims a window the data doesn't cover.
 */
function getDataDateLabels(dates: string[]): string[] {
  if (dates.length === 0) return [];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (d: string) => {
    const parts = d.split('T')[0].split('-');
    if (parts.length === 3) {
      const mIdx = parseInt(parts[1], 10) - 1;
      return `${parseInt(parts[2], 10)} ${months[mIdx] || parts[1]}`;
    }
    return d;
  };
  if (dates.length === 1) return [fmt(dates[0])];
  const idxs =
    dates.length <= 4
      ? dates.map((_, i) => i)
      : [0, Math.floor(dates.length / 3), Math.floor((2 * dates.length) / 3), dates.length - 1];
  return idxs.map((i) => fmt(dates[i]));
}

type ChartRange = '1M' | '3M' | '6M' | '1Y';

// Chart ranges persist per chart in localStorage only (never synced):
// the range pills must survive leaving the tab.
function readPersistedRange(key: string, fallback: ChartRange): ChartRange {
  try {
    if (typeof window === 'undefined') return fallback;
    const parsed = JSON.parse(localStorage.getItem('ascend-progress-ranges') || '{}');
    return ['1M', '3M', '6M', '1Y'].includes(parsed[key]) ? parsed[key] : fallback;
  } catch {
    return fallback;
  }
}

// Chart-frame captions (Stage 5): the data window actually covered, and
// the plotted value span with its unit — never a range the data lacks.
function dataWindow(points: { date: string }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return formatProgressDate(points[0].date);
  return `${formatProgressDate(points[0].date)} – ${formatProgressDate(points[points.length - 1].date)}`;
}

function minMaxLabel(points: { value: number }[], unit: string): string | null {
  if (points.length === 0) return null;
  const vals = points.map((pt) => pt.value);
  return `${Math.min(...vals)} – ${Math.max(...vals)} ${unit}`;
}

interface ProgressPageProps {
  initialTab?: 'overview' | 'strength' | 'prs' | 'bodyweight' | 'training' | 'body' | 'consistency';
  onNavigate?: (tab: 'home' | 'workout' | 'progress' | 'meals' | 'prs') => void;
}

export default function ProgressPage({ initialTab = 'strength', onNavigate }: ProgressPageProps) {
  // Normalize tabs
  const resolvedInitialTab = useMemo<'strength' | 'body' | 'consistency'>(() => {
    if (initialTab === 'bodyweight' || initialTab === 'body') return 'body';
    if (initialTab === 'training' || initialTab === 'consistency') return 'consistency';
    return 'strength';
  }, [initialTab]);

  const [activeTab, setActiveTab] = useState<'strength' | 'body' | 'consistency'>(resolvedInitialTab);
  const [strengthSubView, setStrengthSubView] = useState<'overview' | 'analytics' | 'records'>(
    initialTab === 'prs' ? 'records' : 'overview'
  );
  const [bodySubView, setBodySubView] = useState<'measurements' | 'photos'>('measurements');
  const [consistencySubView, setConsistencySubView] = useState<'overview' | 'streaks'>('overview');

  // Exercise & time range controls for Screen 15 (Strength Analytics)
  const [selectedExercise, setSelectedExercise] = useState<string>('Bench Press');
  const [strengthTimeRange, setStrengthTimeRange] = useState<ChartRange>(() => readPersistedRange('strength', '3M'));

  // Time range control for Screen 16 (Bodyweight Trend)
  const [bodyTimeRange, setBodyTimeRange] = useState<ChartRange>(() => readPersistedRange('body', '3M'));

  // Auxiliary modals
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isMeetModalOpen, setIsMeetModalOpen] = useState(false);
  const [isWeeklyRecapOpen, setIsWeeklyRecapOpen] = useState(false);
  const [isDotsInfoOpen, setIsDotsInfoOpen] = useState(false);
  const dotsInfoRef = useRef<HTMLDivElement>(null); const { dialogProps: dotsInfoDialogProps } = useModalA11y(dotsInfoRef, isDotsInfoOpen, () => setIsDotsInfoOpen(false));
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null); const { dialogProps: toolsMenuDialogProps } = useModalA11y(toolsMenuRef, isToolsMenuOpen, () => setIsToolsMenuOpen(false));

  useEffect(() => {
    if (initialTab === 'bodyweight' || initialTab === 'body') {
      setActiveTab('body');
    } else if (initialTab === 'training' || initialTab === 'consistency') {
      setActiveTab('consistency');
    } else if (initialTab === 'prs') {
      setActiveTab('strength');
      setStrengthSubView('records');
    } else if (initialTab === 'strength' || initialTab === 'overview') {
      setActiveTab('strength');
      setStrengthSubView('overview');
    }
  }, [initialTab]);

  const profile = useStore((state) => state.profile);
  const setProfile = useStore((state) => state.setProfile);
  const prs = useStore((state) => state.prs || []);
  const workouts = useStore((state) => state.workouts || []);
  const bodyMetrics = useStore((state) => state.bodyMetrics || []);
  const progressPhotos = useStore((state) => state.progressPhotos || []);
  const addProgressPhoto = useStore((state) => state.addProgressPhoto);
  const removeProgressPhoto = useStore((state) => state.removeProgressPhoto);
  const trainingProfile = useStore((state) => state.trainingProfile);
  const uiPreferences = useStore((state) => state.uiPreferences);
  const setUiPreferences = useStore((state) => state.setUiPreferences);
  const toast = useToast();
  const { t } = useTranslation();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoPose, setPhotoPose] = useState<'Front' | 'Side' | 'Back'>('Front');
  const [photoPendingDelete, setPhotoPendingDelete] = useState<ProgressPhoto | null>(null);

  const handlePhotoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploadingPhoto(true);
    try {
      const processed = await resizeAndCompressImage(file, {
        maxDimension: 800,
        quality: 0.72,
        format: 'image/jpeg',
      });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read the photo.'));
        reader.readAsDataURL(processed.blob);
      });
      const persisted = addProgressPhoto({
        id: safeRandomId('photo'),
        dataUrl,
        date: getLocalTodayStr(),
        // Pose label so front/side/back shots stay distinguishable and a
        // future compare view can pair them.
        label: photoPose,
      });
      if (!persisted) {
        // Storage is full: the photo shows now but will NOT survive a
        // restart. Never claim it was saved.
        toast.error(
          t('progress.photoNotSavedMsg'),
          t('progress.photoNotSavedTitle')
        );
      } else if (progressPhotos.length >= 24) {
        // The store keeps the newest 24 — say so instead of silently
        // evicting the oldest check-in photo.
        toast.info(t('progress.photoLimitMsg'), t('progress.photoLimitTitle'));
      } else {
        toast.success(t('progress.photoAddedMsg'), t('progress.photoAddedTitle'));
      }
    } catch (err) {
      toast.error(toUserMessage(err, 'image'), t('progress.photoUploadFailedTitle'));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const userUnit = profile?.unit || 'lbs';

  const displayWeight = (kg: number | null | undefined): string => {
    if (kg === null || kg === undefined || isNaN(kg) || kg <= 0) {
      return '—';
    }
    if (userUnit === 'lbs') {
      return `${Math.round(kg * 2.20462)} lbs`;
    }
    return `${Math.round(kg * 10) / 10} kg`;
  };

  const { goBack, canGoBack, registerBackHandler } = useAppNavigation();

  // Back Handlers
  useEffect(() => {
    if (isToolsMenuOpen) {
      return registerBackHandler(() => { setIsToolsMenuOpen(false); return true; }, 100);
    }
  }, [isToolsMenuOpen, registerBackHandler]);

  useEffect(() => {
    if (isWeightModalOpen) {
      return registerBackHandler(() => { setIsWeightModalOpen(false); return true; }, 100);
    }
  }, [isWeightModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isMeetModalOpen) {
      return registerBackHandler(() => { setIsMeetModalOpen(false); return true; }, 100);
    }
  }, [isMeetModalOpen, registerBackHandler]);

  useEffect(() => {
    if (isWeeklyRecapOpen) {
      return registerBackHandler(() => { setIsWeeklyRecapOpen(false); return true; }, 100);
    }
  }, [isWeeklyRecapOpen, registerBackHandler]);

  useEffect(() => {
    if (isDotsInfoOpen) {
      return registerBackHandler(() => { setIsDotsInfoOpen(false); return true; }, 100);
    }
  }, [isDotsInfoOpen, registerBackHandler]);

  // Sub-view Back Handler: return to Screen 14 (Strength Overview)
  useEffect(() => {
    if (activeTab === 'strength' && strengthSubView !== 'overview') {
      return registerBackHandler(() => {
        setStrengthSubView('overview');
        return true;
      }, 60);
    }
  }, [activeTab, strengthSubView, registerBackHandler]);

  // Sub-tab Back Handler: return to Strength (primary Progress tab)
  useEffect(() => {
    if (activeTab !== 'strength') {
      return registerBackHandler(() => {
        setActiveTab('strength');
        return true;
      }, 40);
    }
  }, [activeTab, registerBackHandler]);

  // Synchronize active sub-tab with the URL and the persisted store, so a
  // refresh restores this exact Progress section.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const currentSub = activeTab === 'strength' && strengthSubView === 'records' ? 'prs' : activeTab;
      // Progress-local ids map to navigation-level sub ids.
      const navSub = currentSub === 'body' ? 'bodyweight' : currentSub === 'consistency' ? 'training' : currentSub;
      useStore.getState().setLastActiveTab('progress', navSub);
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') === 'progress' || url.searchParams.get('tab') === 'prs') {
        if (currentSub === 'strength') {
          url.searchParams.delete('sub');
        } else {
          url.searchParams.set('sub', currentSub);
        }
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      }
    } catch {}
  }, [activeTab, strengthSubView]);

  // (Chart-range persistence lives below, after the big-three lift state
  // it also persists — a deps array may not reference a later const.)

  // ── 1. REAL STRENGTH ANALYTICS & PRs DATA ─────────────────────────────────
  // Core compound lifts computed strictly from real records
  const coreLifts = useMemo(() => {
    const list = [
      { name: 'Squat', search: ['squat'] },
      { name: 'Bench Press', search: ['bench press', 'bench'] },
      { name: 'Deadlift', search: ['deadlift'] },
      { name: 'Overhead Press', search: ['overhead press', 'ohp', 'military press'] },
    ];

    return list.map((item) => {
      // Check PRs
      const matchPRs = prs
        .filter((p) => item.search.some((s) => p.exercise.toLowerCase().includes(s)))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      let best1RMKg: number | null = matchPRs.length > 0 ? Math.max(...matchPRs.map((p) => p.oneRepMax)) : null;

      // Check workouts if no PR found
      if (best1RMKg === null) {
        let maxWorkout1RM = 0;
        workouts.forEach((w) => {
          w.exercises.forEach((ex) => {
            if (item.search.some((s) => ex.name.toLowerCase().includes(s))) {
              ex.sets.filter(isSetCompleted).forEach((s) => {
                if (s.weight && s.reps) {
                  const wKg = s.unit === 'lbs' ? s.weight * 0.453592 : s.weight;
                  const e1rm = calculateOneRepMax(wKg, s.reps);
                  if (e1rm > maxWorkout1RM) maxWorkout1RM = e1rm;
                }
              });
            }
          });
        });
        if (maxWorkout1RM > 0) best1RMKg = maxWorkout1RM;
      }

      return {
        name: item.name,
        best1RMKg,
        hasRealRecord: best1RMKg !== null,
      };
    });
  }, [prs, workouts]);

  // Distinct exercises available in user's history or defaults
  const availableExercises = useMemo(() => {
    const set = new Set<string>(['Bench Press', 'Squat', 'Deadlift', 'Overhead Press']);
    prs.forEach((p) => {
      if (p.exercise) set.add(p.exercise);
    });
    workouts.forEach((w) => {
      w.exercises.forEach((e) => {
        if (e.name) set.add(e.name);
      });
    });
    return Array.from(set);
  }, [prs, workouts]);

  // Identify hero lift for Screen 14 Card 1
  const heroLift = useMemo(() => {
    const bench = coreLifts.find((l) => l.name === 'Bench Press');
    if (bench && bench.hasRealRecord) return bench;
    const anyRecorded = coreLifts.find((l) => l.hasRealRecord);
    if (anyRecorded) return anyRecorded;
    return bench || { name: 'Bench Press', best1RMKg: null, hasRealRecord: false };
  }, [coreLifts]);

  // Hero lift session history & real delta for Screen 14
  const heroLiftAnalytics = useMemo(() => {
    const sessions = getExerciseHistorySessions(heroLift.name, workouts, userUnit, { exact: true });
    const prMatches = prs
      .filter((p) => exerciseNamesEqual(p.exercise, heroLift.name))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Combine into chronological progress points
    const pointsMap = new Map<string, number>();
    prMatches.forEach((p) => {
      const val = userUnit === 'lbs' ? p.weightLbs : p.weightKg;
      const e1rm = calculateOneRepMax(val, p.reps);
      pointsMap.set(p.date, Math.round(e1rm * 10) / 10);
    });
    sessions.forEach((s) => {
      pointsMap.set(s.date, Math.round(s.bestE1RM * 10) / 10);
    });

    const sortedDates = Array.from(pointsMap.keys()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const dataPoints = sortedDates.map((d) => ({ date: d, value: pointsMap.get(d)! }));

    let deltaText = 'No data';
    if (dataPoints.length >= 2) {
      const latest = dataPoints[dataPoints.length - 1].value;
      const first = dataPoints[0].value;
      const delta = latest - first;
      const pct = first > 0 ? (delta / first) * 100 : 0;
      deltaText = `${delta >= 0 ? '+' : ''}${Math.round(delta)} ${userUnit} (${delta >= 0 ? '+' : ''}${Math.round(pct)}%)`;
    } else if (dataPoints.length === 1) {
      deltaText = 'Baseline';
    }

    return {
      dataPoints,
      deltaText,
      latest1RM: dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].value : heroLift.best1RMKg ? (userUnit === 'lbs' ? Math.round(heroLift.best1RMKg * 2.20462) : Math.round(heroLift.best1RMKg * 10) / 10) : null,
    };
  }, [heroLift, workouts, prs, userUnit]);

  // Selected exercise sessions for Screen 15
  const selectedExerciseSessions = useMemo(() => {
    // Unified data source: workout sessions AND manually logged PRs, merged
    // by date. PRs that duplicate a session (auto-detected from that session)
    // are skipped so nothing appears twice.
    const sessions = getExerciseHistorySessions(selectedExercise, workouts, userUnit, { exact: true }) || [];
    const prMatches = prs.filter((p) => exerciseNamesEqual(p.exercise, selectedExercise));

    type Row = { date: string; bestWeight: number; bestReps: number; bestE1RM: number; source: 'session' | 'pr' };
    const rows: Row[] = sessions.map((s) => ({
      date: s.date,
      bestWeight: s.bestWeight,
      bestReps: s.bestReps,
      bestE1RM: s.bestE1RM,
      source: 'session' as const,
    }));
    for (const p of prMatches) {
      const val = userUnit === 'lbs' ? p.weightLbs : p.weightKg;
      const e1rm = Math.round(calculateOneRepMax(val, p.reps) * 10) / 10;
      const dup = rows.some((r) => r.date === p.date && Math.abs(r.bestE1RM - e1rm) < 0.051);
      if (!dup) {
        rows.push({
          date: p.date,
          bestWeight: Math.round(val * 10) / 10,
          bestReps: p.reps,
          bestE1RM: e1rm,
          source: 'pr' as const,
        });
      }
    }
    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return rows.slice(0, 5).map((s, idx, arr) => {
      let deltaStr = s.source === 'pr' ? 'PR Log' : 'Completed';
      if (idx < arr.length - 1) {
        const prevE1RM = arr[idx + 1].bestE1RM;
        if (prevE1RM > 0) {
          const diffPct = Math.round(((s.bestE1RM - prevE1RM) / prevE1RM) * 100);
          deltaStr = `${diffPct >= 0 ? '+' : ''}${diffPct}%`;
        }
      }
      return {
        date: s.date,
        bestWeight: s.bestWeight,
        bestReps: s.bestReps,
        bestE1RM: s.bestE1RM,
        deltaStr,
        hasData: true,
      };
    });
  }, [selectedExercise, workouts, prs, userUnit]);

  // Selected exercise 1RM and filtered progress chart for Screen 15
  const selectedExerciseAnalytics = useMemo(() => {
    const rawSessions = getExerciseHistorySessions(selectedExercise, workouts, userUnit, { exact: true });
    const prMatches = prs
      .filter((p) => exerciseNamesEqual(p.exercise, selectedExercise))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const pointsMap = new Map<string, number>();
    prMatches.forEach((p) => {
      const val = userUnit === 'lbs' ? p.weightLbs : p.weightKg;
      const e1rm = calculateOneRepMax(val, p.reps);
      pointsMap.set(p.date, Math.round(e1rm * 10) / 10);
    });
    rawSessions.forEach((s) => {
      pointsMap.set(s.date, Math.round(s.bestE1RM * 10) / 10);
    });

    const now = Date.now();
    const daysCutoff = strengthTimeRange === '1M' ? 30 : strengthTimeRange === '3M' ? 90 : strengthTimeRange === '6M' ? 180 : 365;
    const cutoffTime = now - daysCutoff * 86400000;

    const sortedFilteredDates = Array.from(pointsMap.keys())
      .filter((d) => new Date(d).getTime() >= cutoffTime)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const dataPoints = sortedFilteredDates.map((d) => ({ date: d, value: pointsMap.get(d)! }));

    let deltaText = 'No data';
    if (dataPoints.length >= 2) {
      const latest = dataPoints[dataPoints.length - 1].value;
      const first = dataPoints[0].value;
      const delta = latest - first;
      const pct = first > 0 ? (delta / first) * 100 : 0;
      deltaText = `${delta >= 0 ? '+' : ''}${Math.round(delta)} ${userUnit} (${delta >= 0 ? '+' : ''}${Math.round(pct)}%)`;
    } else if (dataPoints.length === 1) {
      deltaText = 'Baseline';
    }

    const latestVal = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].value : null;

    return {
      dataPoints,
      deltaText,
      latest1RM: latestVal,
    };
  }, [selectedExercise, workouts, prs, userUnit, strengthTimeRange]);

  // ── 2. REAL BODY COMPOSITION & MEASUREMENTS DATA ──────────────────────────
  const sortedMetrics = useMemo(() => {
    if (!bodyMetrics || bodyMetrics.length === 0) return [];
    return [...bodyMetrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [bodyMetrics]);

  const latestMetrics = useMemo<Partial<BodyMetricEntry>>(() => {
    return sortedMetrics.length > 0 ? sortedMetrics[0] : {};
  }, [sortedMetrics]);

  const currentWeightKg = useMemo(() => {
    if (sortedMetrics.length > 0) return sortedMetrics[0].weightKg;
    return profile?.bodyweightKg || null;
  }, [sortedMetrics, profile]);

  // Bodyweight trend chart & real delta
  const bodyweightAnalytics = useMemo(() => {
    if (sortedMetrics.length === 0 && !profile?.bodyweightKg) {
      return { dataPoints: [], deltaText: 'No logs yet', latestWeight: null };
    }

    const now = Date.now();
    const daysCutoff = bodyTimeRange === '1M' ? 30 : bodyTimeRange === '3M' ? 90 : bodyTimeRange === '6M' ? 180 : 365;
    const cutoffTime = now - daysCutoff * 86400000;

    const filtered = sortedMetrics
      .filter((m) => new Date(m.date).getTime() >= cutoffTime)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const dataPoints = filtered.map((m) => {
      const val = userUnit === 'lbs' ? m.weightKg * 2.20462 : m.weightKg;
      return { date: m.date, value: Math.round(val * 10) / 10 };
    });

    let deltaText = 'No logs yet';
    if (dataPoints.length >= 2) {
      // SIM-P2-03: the headline delta was endpoint-based (latest minus
      // first), so one bad weigh-in swung the number the user sees —
      // while the coach trend uses regression. Use fitted endpoints
      // from a least-squares line over the window instead: same format,
      // resistant to single-point noise.
      const firstTime = new Date(dataPoints[0].date).getTime();
      const xs = dataPoints.map((d) => (new Date(d.date).getTime() - firstTime) / 86400000);
      const ys = dataPoints.map((d) => d.value);
      const n = xs.length;
      const meanX = xs.reduce((a, b) => a + b, 0) / n;
      const meanY = ys.reduce((a, b) => a + b, 0) / n;
      const num = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0);
      const den = xs.reduce((s, x) => s + (x - meanX) * (x - meanX), 0);
      const slope = den === 0 ? 0 : num / den;
      const intercept = meanY - slope * meanX;
      const fittedFirst = intercept;
      const fittedLast = intercept + slope * xs[n - 1];
      const delta = fittedLast - fittedFirst;
      const pct = fittedFirst > 0 ? (delta / fittedFirst) * 100 : 0;
      deltaText = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} ${userUnit} (${delta >= 0 ? '+' : ''}${Math.round(pct)}%)`;
    } else if (dataPoints.length === 1) {
      deltaText = 'Baseline';
    } else if (currentWeightKg) {
      deltaText = 'Current';
    }

    return {
      dataPoints,
      deltaText,
      latestWeight: currentWeightKg ? (userUnit === 'lbs' ? Math.round(currentWeightKg * 2.20462) : Math.round(currentWeightKg * 10) / 10) : null,
    };
  }, [sortedMetrics, profile, userUnit, bodyTimeRange, currentWeightKg]);

  // ── 3. REAL CONSISTENCY & STREAK DATA ─────────────────────────────────────
  const consistencyStats = useMemo(() => {
    const today = new Date();
    const todayStr = getLocalDateStr(today);

    // Group workouts by unique calendar date (deduplicating multiple sessions per day)
    const workoutDays = new Set<string>();
    workouts.forEach((w) => {
      if (w.date) {
        const dStr = w.date.split('T')[0];
        const hasCompletedSets = w.exercises.some((e) => e.sets.some(isSetCompleted));
        if (hasCompletedSets || w.exercises.length > 0) {
          workoutDays.add(dStr);
        }
      }
    });

    // Calculate real consecutive daily streak
    let streakDays = 0;
    const checkDate = new Date(today);
    if (!workoutDays.has(todayStr)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    while (streakDays < 365) {
      const dStr = getLocalDateStr(checkDate);
      if (workoutDays.has(dStr)) {
        streakDays++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Current calendar week (Monday–Sunday) — the week always starts on Monday.
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const weekDates = getWeekDateStrings(today);
    let thisWeekCompleted = 0;
    const dayBars = weekDates.map((dStr, i) => {
      const label = dayLabels[i];
      const isCompleted = workoutDays.has(dStr);
      if (isCompleted) thisWeekCompleted++;

      return {
        label,
        dateStr: dStr,
        isCompleted,
        heightPct: isCompleted ? 85 : 15,
      };
    });

    // 4 calendar weeks (Monday–Sunday), current week first.
    const weeklyTarget = trainingProfile?.daysPerWeek || 5;
    let fourWeeksCompleted = 0;
    const fourWeeksBreakdown: { label: string; count: number; target: number; pct: number }[] = [];

    for (let w = 0; w < 4; w++) {
      // Monday of the target week, then its 7 Mon–Sun date strings.
      const weekAnchor = new Date(today);
      weekAnchor.setDate(today.getDate() - w * 7);
      const weekStrs = getWeekDateStrings(weekAnchor);

      let count = 0;
      for (const dStr of weekStrs) {
        if (workoutDays.has(dStr)) {
          count++;
        }
      }
      fourWeeksCompleted += count;
      const pct = Math.min(100, Math.round((count / weeklyTarget) * 100));
      fourWeeksBreakdown.push({
        label: w === 0 ? 'Week 4 (Current)' : w === 1 ? 'Week 3' : w === 2 ? 'Week 2' : 'Week 1',
        count,
        target: weeklyTarget,
        pct,
      });
    }

    const fourWeeksTarget = weeklyTarget * 4;
    const consistencyPct = Math.round((fourWeeksCompleted / fourWeeksTarget) * 100);

    return {
      streakDays,
      thisWeekCompleted,
      thisWeekTarget: weeklyTarget,
      fourWeeksCompleted,
      fourWeeksTarget,
      consistencyPct,
      dayBars,
      fourWeeksBreakdown,
    };
  }, [workouts, trainingProfile?.daysPerWeek]);

  // DOTS calculation for powerlifting modal
  const bigThreeStats = useMemo(() => getBigThreeStats(prs), [prs]);
  const dotsScore = useMemo(() => {
    // SIM-P1-07: DOTS is defined only for a full S/B/D total.
    if (!profile || !profile.bodyweightKg || bigThreeStats.totalKg === 0 || !bigThreeStats.isComplete) return 0;
    return calculateDOTS(profile.bodyweightKg, bigThreeStats.totalKg, profile.gender);
  }, [profile, bigThreeStats]);
  const dotsClassification = useMemo(() => getDOTSClassification(dotsScore), [dotsScore]);

  // Screen 14 Hero Chart Geometry
  const heroChartGeometry = useMemo(() => {
    return computeChartGeometry(heroLiftAnalytics.dataPoints, 320, 110, 10, 20);
  }, [heroLiftAnalytics.dataPoints]);

  // Screen 15 Analytics Chart Geometry
  const strengthChartGeometry = useMemo(() => {
    return computeChartGeometry(selectedExerciseAnalytics.dataPoints, 320, 120, 10, 20);
  }, [selectedExerciseAnalytics.dataPoints]);

  // Screen 16 Bodyweight Chart Geometry
  const bodyChartGeometry = useMemo(() => {
    return computeChartGeometry(bodyweightAnalytics.dataPoints, 320, 100, 10, 20);
  }, [bodyweightAnalytics.dataPoints]);

  // ── UX redesign Stage 5 — goal-aware spotlight ─────────────────────
  const primaryGoal = resolvePrimaryGoal(profile?.goals);
  const spotlightChart = resolveSpotlightChart(primaryGoal, uiPreferences.pinnedProgressChart);
  const [big3Lift, setBig3Lift] = useState<'Squat' | 'Bench Press' | 'Deadlift'>(() => {
    // Stage 10: the big-three lift filter persists like the chart ranges
    // (local only); an invalid stored value falls back to Squat.
    if (typeof window === 'undefined') return 'Squat';
    try {
      const parsed = JSON.parse(localStorage.getItem('ascend-progress-ranges') || '{}');
      return parsed.big3 === 'Bench Press' || parsed.big3 === 'Deadlift' ? parsed.big3 : 'Squat';
    } catch {
      return 'Squat';
    }
  });
  // Big-three trend mirrors the hero computation (sessions + PRs).
  const big3Analytics = useMemo(() => {
    const sessions = getExerciseHistorySessions(big3Lift, workouts, userUnit, { exact: true });
    const prMatches = prs
      .filter((pr) => exerciseNamesEqual(pr.exercise, big3Lift))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const pointsMap = new Map<string, number>();
    prMatches.forEach((pr) => {
      const val = userUnit === 'lbs' ? pr.weightLbs : pr.weightKg;
      pointsMap.set(pr.date, Math.round(calculateOneRepMax(val, pr.reps) * 10) / 10);
    });
    sessions.forEach((sess) => pointsMap.set(sess.date, Math.round(sess.bestE1RM * 10) / 10));
    const sortedDates = Array.from(pointsMap.keys()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const dataPoints = sortedDates.map((d) => ({ date: d, value: pointsMap.get(d)! }));
    let deltaText = 'No data';
    if (dataPoints.length >= 2) {
      const latest = dataPoints[dataPoints.length - 1].value;
      const first = dataPoints[0].value;
      const delta = latest - first;
      const pct = first > 0 ? (delta / first) * 100 : 0;
      deltaText = `${delta >= 0 ? '+' : ''}${Math.round(delta)} ${userUnit} (${delta >= 0 ? '+' : ''}${Math.round(pct)}%)`;
    } else if (dataPoints.length === 1) {
      deltaText = 'Baseline';
    }
    return { dataPoints, deltaText, latest1RM: dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].value : null };
  }, [big3Lift, workouts, prs, userUnit]);
  const big3Geometry = useMemo(
    () => computeChartGeometry(big3Analytics.dataPoints, 320, 110, 10, 20),
    [big3Analytics.dataPoints],
  );

  // Persist chart ranges + big-three lift filter (local only) whenever one
  // changes. Placed here (not with the other effects above) because the
  // deps array evaluates during render and big3Lift is declared above.
  useEffect(() => {
    try {
      localStorage.setItem('ascend-progress-ranges', JSON.stringify({ strength: strengthTimeRange, body: bodyTimeRange, big3: big3Lift }));
    } catch {}
  }, [strengthTimeRange, bodyTimeRange, big3Lift]);

  // Goal change clears a pinned chart (with a toast) — the spotlight
  // follows the new goal until the user pins again. Mount does not
  // clear: prevGoalRef starts at the current goal.
  const prevGoalRef = useRef(primaryGoal);
  useEffect(() => {
    if (prevGoalRef.current !== primaryGoal) {
      prevGoalRef.current = primaryGoal;
      if (uiPreferences.pinnedProgressChart) {
        setUiPreferences({ pinnedProgressChart: null });
        toast.info(t('progress.spotlightReset'));
      }
    }
  }, [primaryGoal, uiPreferences.pinnedProgressChart, setUiPreferences, toast, t]);

  return (
    <div className="page animate-fade-in space-y-4 max-w-md mx-auto pb-12">
      {/* ── TOP HEADER ────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-2">
          {/* Back button logic */}
          {activeTab === 'strength' && strengthSubView !== 'overview' ? (
            <button
              type="button"
              onClick={() => setStrengthSubView('overview')}
              className="p-2 min-h-[44px] min-w-[44px] -ml-1 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card border border-border/50 hover:border-accent/40 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={t('progress.backProgress')}
            >
              <ChevronLeft className="w-5 h-5 text-accent" />
            </button>
          ) : activeTab !== 'strength' ? (
            <button
              type="button"
              onClick={() => setActiveTab('strength')}
              className="p-2 min-h-[44px] min-w-[44px] -ml-1 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card border border-border/50 hover:border-accent/40 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={t('progress.backStrength')}
            >
              <ChevronLeft className="w-5 h-5 text-accent" />
            </button>
          ) : canGoBack ? (
            <button
              type="button"
              onClick={goBack}
              className="p-2 min-h-[44px] min-w-[44px] -ml-1 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card border border-border/50 hover:border-accent/40 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={t('progress.goBack')}
            >
              <ChevronLeft className="w-5 h-5 text-accent" />
            </button>
          ) : null}

          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-sans text-text-primary tracking-tight">
              {activeTab === 'strength' && strengthSubView === 'overview'
                ? t('progress.strength')
                : activeTab === 'strength'
                ? t('progress.strength')
                : activeTab === 'body'
                ? t('progress.body')
                : t('progress.consistency')}
            </h1>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsWeeklyRecapOpen(true)}
            className="p-2 min-h-[44px] min-w-[44px] rounded-xl bg-bg-card border border-border text-text-secondary hover:text-accent transition-colors flex items-center justify-center cursor-pointer shadow-xs"
            title={t('progress.weeklyCard')}
            aria-label={t('progress.weeklyCard')}
          >
            <Share2 className="w-4 h-4 text-accent" />
          </button>
          <button
            type="button"
            onClick={() => setIsToolsMenuOpen(true)}
            className="p-2 min-h-[44px] min-w-[44px] rounded-xl bg-bg-card border border-border text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center cursor-pointer shadow-xs"
            title={t('progress.toolsTitle')}
            aria-label={t('progress.toolsAria')}
          >
            <SlidersHorizontal className="w-4 h-4 text-accent" />
          </button>
        </div>
      </header>

      {/* ── TOP SEGMENTED CONTROL: STRENGTH | BODY | CONSISTENCY ───────────── */}
      {/* Visible on Screen 14 overview */}
      {activeTab === 'strength' && strengthSubView === 'overview' && (
        <div role="tablist" aria-label={t('progress.viewsAria')} className="segmented-control" onKeyDown={tabListKeyDown((i) => { const k = (['strength', 'body', 'consistency'] as const)[i]; if (k === 'strength') { setActiveTab('strength'); setStrengthSubView('overview'); } else { setActiveTab(k); } })}>
          {(['strength', 'body', 'consistency'] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              role="tab"
              aria-selected={activeTab === tabKey}
              onClick={() => {
                if (tabKey === 'strength') {
                  setActiveTab('strength');
                  setStrengthSubView('overview');
                } else {
                  setActiveTab(tabKey);
                }
              }}
              className={`segmented-item ${activeTab === tabKey ? 'active' : ''}`}
            >
              {tabKey === 'strength' ? t('progress.strength') : tabKey === 'body' ? t('progress.body') : t('progress.consistency')}
            </button>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SCREEN 14: PROGRESS OVERVIEW                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'strength' && strengthSubView === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          {/* ── SPOTLIGHT (UX redesign Stage 5): goal-aware first card ── */}
          {spotlightChart === 'volume' ? (
            uiPreferences.showMuscleVolume !== false ? (
              <MuscleVolumeSection workouts={workouts} />
            ) : (
              <div className="card p-5 bg-bg-card border border-border shadow-xs">
                <EmptyState
                  title={t('progress.spotVolumeOffTitle')}
                  explanation={t('progress.spotVolumeOffHint')}
                  actionLabel={t('progress.spotVolumeOffAction')}
                  onAction={() => setUiPreferences({ showMuscleVolume: true })}
                />
              </div>
            )
          ) : spotlightChart === 'consistency' ? (
            <WorkoutHeatmap onNavigate={onNavigate} />
          ) : spotlightChart === 'weight' ? (
            bodyweightAnalytics.dataPoints.length > 0 || bodyweightAnalytics.latestWeight ? (
              <div
                onClick={() => setActiveTab('body')}
                className="card p-5 bg-bg-card border border-border space-y-3 cursor-pointer hover:border-accent/40 transition-all shadow-xs group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-text-primary">{t('progress.spotQuestionWeight')}</h2>
                    <span className="text-xs font-semibold text-text-secondary">{t('progress.chartWeight')}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <div>
                    <div className="text-3xl font-black text-text-primary font-sans tabular-nums">
                      {bodyweightAnalytics.latestWeight ? `${bodyweightAnalytics.latestWeight} ${userUnit}` : '—'}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-[#858076]/15 text-[#5E615A] dark:text-[#A5A096]">
                    {bodyweightAnalytics.deltaText}
                  </span>
                </div>
                <div className="pt-2">
                  <svg viewBox="0 0 320 110" className="w-full h-28 overflow-visible" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="spotWeightGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#858076" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#858076" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="30" x2="320" y2="30" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                    <line x1="0" y1="80" x2="320" y2="80" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                    {bodyChartGeometry.points.length > 0 ? (
                      <>
                        {bodyChartGeometry.pathD ? (
                          <>
                            <path d={bodyChartGeometry.areaD} fill="url(#spotWeightGradient)" />
                            <path d={bodyChartGeometry.pathD} fill="none" stroke="#858076" strokeWidth="2.5" strokeLinecap="round" />
                          </>
                        ) : null}
                        {bodyChartGeometry.points.map((pt, i) => (
                          <circle key={i} cx={pt.x} cy={pt.y} r={i === bodyChartGeometry.points.length - 1 ? 4 : 3} fill="#858076" stroke={i === bodyChartGeometry.points.length - 1 ? '#FFFFFF' : 'none'} strokeWidth={i === bodyChartGeometry.points.length - 1 ? 2 : 0} />
                        ))}
                      </>
                    ) : (
                      <text x="160" y="60" textAnchor="middle" className="text-xs fill-text-muted font-sans">
                        {t('progress.chartEmptyBodyweight')}
                      </text>
                    )}
                  </svg>
                  <div className="flex justify-between text-2xs text-text-muted font-mono pt-1">
                    {getDataDateLabels(bodyweightAnalytics.dataPoints.map((d) => d.date)).map((m, i) => (
                      <span key={i}>{m}</span>
                    ))}
                  </div>
                  <div className="flex justify-between text-2xs text-text-muted font-mono pt-1">
                    <span>{t('progress.legendMeasured')}</span>
                    <span>{dataWindow(bodyweightAnalytics.dataPoints)}{dataWindow(bodyweightAnalytics.dataPoints) ? ` · ${bodyTimeRange}` : ''}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card p-5 bg-bg-card border border-border shadow-xs">
                <EmptyState
                  title={t('progress.chartEmptyBodyweight')}
                  explanation={t('progress.spotEmptyWeightHint')}
                  actionLabel={t('progress.logMeasurement')}
                  onAction={() => setIsWeightModalOpen(true)}
                />
              </div>
            )
          ) : spotlightChart === 'big3' ? (
            <div className="card p-5 bg-bg-card border border-border space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-text-primary">{t('progress.spotQuestionBig3')}</h2>
                  <span className="text-xs font-semibold text-text-secondary">{t('progress.chartBig3')}</span>
                </div>
                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-2xs font-bold text-accent-text">{t('common.estimatedShort')}</span>
              </div>
              <SegmentedControl
                ariaLabel={t('progress.chartBig3')}
                value={big3Lift}
                options={[
                  { value: 'Squat', label: 'Squat' },
                  { value: 'Bench Press', label: 'Bench Press' },
                  { value: 'Deadlift', label: 'Deadlift' },
                ]}
                onChange={(v) => setBig3Lift(v)}
              />
              {big3Analytics.dataPoints.length > 0 ? (
                <>
                  <div className="flex items-baseline justify-between pt-1">
                    <div>
                      <div className="text-3xl font-black text-text-primary font-sans tabular-nums">
                        {big3Analytics.latest1RM ? `${big3Analytics.latest1RM} ${userUnit}` : '—'}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-[#858076]/15 text-[#5E615A] dark:text-[#A5A096]">
                      {big3Analytics.deltaText}
                    </span>
                  </div>
                  <div className="pt-2">
                    <svg viewBox="0 0 320 120" className="w-full h-28 overflow-visible" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="spotBig3Gradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#E44427" stopOpacity="0.22" />
                          <stop offset="100%" stopColor="#E44427" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <line x1="0" y1="90" x2="320" y2="90" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="3 3" />
                      {big3Geometry.pathD ? (
                        <>
                          <path d={big3Geometry.areaD} fill="url(#spotBig3Gradient)" />
                          <path d={big3Geometry.pathD} fill="none" stroke="#E44427" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 3" />
                        </>
                      ) : null}
                      {big3Geometry.points.map((pt, i) => (
                        <circle key={i} cx={pt.x} cy={pt.y} r={i === big3Geometry.points.length - 1 ? 4 : 3} fill="#E44427" stroke={i === big3Geometry.points.length - 1 ? '#FFFFFF' : 'none'} strokeWidth={i === big3Geometry.points.length - 1 ? 2 : 0} />
                      ))}
                    </svg>
                    <div className="flex justify-between text-2xs text-text-muted font-mono pt-1">
                      {getDataDateLabels(big3Analytics.dataPoints.map((d) => d.date)).map((m, i) => (
                        <span key={i}>{m}</span>
                      ))}
                    </div>
                    <div className="flex justify-between text-2xs text-text-muted font-mono pt-1">
                      <span>{t('progress.legendEstimated')}</span>
                      <span>{dataWindow(big3Analytics.dataPoints)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState
                  title={t('progress.chartEmptySessions')}
                  explanation={t('progress.spotEmptyBig3Hint')}
                  actionLabel={t('train.startWorkout')}
                  onAction={() => onNavigate?.('workout')}
                />
              )}
            </div>
          ) : heroLiftAnalytics.dataPoints.length > 0 || heroLiftAnalytics.latest1RM ? (
            <div
              onClick={() => {
                setSelectedExercise(heroLift.name);
                setStrengthSubView('analytics');
              }}
              className="card p-5 bg-bg-card border border-border space-y-3 cursor-pointer hover:border-accent/40 transition-all shadow-xs group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-text-primary">{t('progress.spotQuestionE1rm', { lift: heroLift.name })}</h2>
                  <span className="text-xs font-semibold text-text-secondary">{heroLift.name}</span>
                  <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-2xs font-bold text-accent-text">{t('common.estimatedShort')}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <div className="text-3xl font-black text-text-primary font-sans tabular-nums">
                    {heroLiftAnalytics.latest1RM ? `${heroLiftAnalytics.latest1RM} ${userUnit}` : displayWeight(heroLift.best1RMKg)}
                  </div>
                  <span className="text-2xs text-text-muted font-mono">Current 1RM (your estimated best single lift)</span>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-[#858076]/15 text-[#5E615A] dark:text-[#A5A096]">
                  {heroLiftAnalytics.deltaText}
                </span>
              </div>
              <div className="pt-2">
                <svg viewBox="0 0 320 120" className="w-full h-28 overflow-visible" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="strengthGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E44427" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#E44427" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="90" x2="320" y2="90" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="3 3" />
                  {heroChartGeometry.points.length > 0 ? (
                    <>
                      {heroChartGeometry.pathD ? (
                        <>
                          <path d={heroChartGeometry.areaD} fill="url(#strengthGradient)" />
                          <path
                            d={heroChartGeometry.pathD}
                            fill="none"
                            stroke="#E44427"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeDasharray="6 3"
                          />
                        </>
                      ) : null}
                      {heroChartGeometry.points.map((pt, i) => (
                        <circle
                          key={i}
                          cx={pt.x}
                          cy={pt.y}
                          r={i === heroChartGeometry.points.length - 1 ? 4 : 3}
                          fill="#E44427"
                          stroke={i === heroChartGeometry.points.length - 1 ? '#FFFFFF' : 'none'}
                          strokeWidth={i === heroChartGeometry.points.length - 1 ? 2 : 0}
                        />
                      ))}
                    </>
                  ) : (
                    <text x="160" y="60" textAnchor="middle" className="text-xs fill-text-muted font-sans">
                      {t('progress.chartEmptyWorkouts')}
                    </text>
                  )}
                </svg>
                <div className="flex justify-between text-2xs text-text-muted font-mono pt-1">
                  {getDataDateLabels(heroLiftAnalytics.dataPoints.map((d) => d.date)).map((m, i) => (
                    <span key={i}>{m}</span>
                  ))}
                </div>
                <div className="flex justify-between text-2xs text-text-muted font-mono pt-1">
                  <span>{t('progress.legendEstimated')}</span>
                  <span>{dataWindow(heroLiftAnalytics.dataPoints)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-5 bg-bg-card border border-border shadow-xs">
              <EmptyState
                title={t('progress.chartEmptyWorkouts')}
                explanation={t('progress.spotEmptyE1rmHint')}
                actionLabel={t('train.startWorkout')}
                onAction={() => onNavigate?.('workout')}
              />
            </div>
          )}
          {/* Pin control — surfaced on the overview, not buried in Settings */}
          <div className="card p-4 bg-bg-card border border-border shadow-xs flex items-center gap-3">
            <label htmlFor="spotlight-pin" className="text-xs font-semibold text-text-secondary shrink-0">{t('progress.pinChart')}</label>
            <select
              id="spotlight-pin"
              value={uiPreferences.pinnedProgressChart ?? 'auto'}
              onChange={(e) => setUiPreferences({ pinnedProgressChart: e.target.value === 'auto' ? null : e.target.value })}
              className="appearance-none flex-1 bg-bg-secondary border border-border text-text-primary font-bold text-sm py-2 px-3 rounded-xl focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="auto">{t('progress.spotlightAuto')}</option>
              {SPOTLIGHT_CHARTS.map((id) => (
                <option key={id} value={id}>{t(SPOTLIGHT_CHART_NAME_KEYS[id] as StringKey)}</option>
              ))}
            </select>
          </div>

          {/* Card 2: Personal Records List */}
          <div className="card p-5 bg-bg-card border border-border space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-text-primary">{t('progress.personalRecords')}</h2>
                <p className="text-2xs text-text-muted mt-0.5">
                  {t('progress.prExplainer')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStrengthSubView('records')}
                className="text-xs font-semibold text-accent-text hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>{t('progress.viewAll')}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-border/60 pt-1">
              {coreLifts.map((lift) => (
                <div
                  key={lift.name}
                  onClick={() => {
                    setSelectedExercise(lift.name);
                    setStrengthSubView('analytics');
                  }}
                  className="py-3 flex items-center justify-between text-xs cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors group"
                >
                  <span className="font-semibold text-text-primary group-hover:text-accent transition-colors">
                    {lift.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text-primary tabular-nums font-mono text-sm">
                      {displayWeight(lift.best1RMKg)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SCREEN 15: STRENGTH (ANALYTICS)                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'strength' && strengthSubView !== 'overview' && (
        <div className="space-y-4 animate-fade-in">
          {/* Sub-tabs: Progress | Records */}
          <div role="tablist" aria-label={t('progress.strengthViewsAria')} className="segmented-control" onKeyDown={tabListKeyDown((i) => setStrengthSubView((['analytics', 'records'] as const)[i]))}>
            <button
              type="button"
              role="tab"
              aria-selected={strengthSubView === 'analytics'}
              onClick={() => setStrengthSubView('analytics')}
              className={`segmented-item ${strengthSubView === 'analytics' ? 'active' : ''}`}
            >
              {t('progress.tabProgress')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={strengthSubView === 'records'}
              onClick={() => setStrengthSubView('records')}
              className={`segmented-item ${strengthSubView === 'records' ? 'active' : ''}`}
            >
              {t('progress.tabRecords')}
            </button>
          </div>

          {strengthSubView === 'analytics' ? (
            <div className="space-y-4">
              {/* Main Analytics Card */}
              <div className="card p-5 bg-bg-card border border-border space-y-4 shadow-xs">
                {/* Exercise dropdown & Time Range */}
                <div className="flex justify-between items-center">
                  <div className="relative inline-block">
                    <select
                      value={selectedExercise}
                      onChange={(e) => setSelectedExercise(e.target.value)}
                      className="appearance-none bg-bg-secondary border border-border text-text-primary font-bold text-sm py-1.5 pl-3 pr-8 rounded-xl focus:outline-none focus:border-accent cursor-pointer"
                    >
                      {availableExercises.map((ex) => (
                        <option key={ex} value={ex} className="bg-bg-card text-text-primary">
                          {ex}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-text-muted">
                      ▼
                    </div>
                  </div>

                  {/* Range pills */}
                  <div className="flex rounded-lg bg-bg-secondary p-0.5 border border-border/80">
                    {(['1M', '3M', '6M', '1Y'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setStrengthTimeRange(r)}
                        className={`px-2 py-0.5 text-2xs font-mono font-bold rounded transition-all cursor-pointer ${
                          strengthTimeRange === r
                            ? 'bg-accent text-accent-on shadow-xs'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1RM readout + delta badge */}
                <div className="flex items-baseline justify-between pt-1">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-4xl font-black text-text-primary font-sans tabular-nums">
                        {selectedExerciseAnalytics.latest1RM ? `${selectedExerciseAnalytics.latest1RM} ${userUnit}` : '—'}
                      </div>
                      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-2xs font-bold text-accent-text">{t('common.estimatedShort')}</span>
                    </div>
                    <span className="text-2xs text-text-muted font-mono">Estimated 1RM (best single lift, worked out from your sets)</span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-[#858076]/15 text-[#5E615A] dark:text-[#A5A096]">
                    {selectedExerciseAnalytics.deltaText}
                  </span>
                </div>

                {/* Dynamic Progression Chart */}
                <div className="pt-2">
                  <svg viewBox="0 0 320 130" className="w-full h-32 overflow-visible" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="analyticsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E44427" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#E44427" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="30" x2="320" y2="30" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                    <line x1="0" y1="70" x2="320" y2="70" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                    <line x1="0" y1="110" x2="320" y2="110" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                    {strengthChartGeometry.points.length > 0 ? (
                      <>
                        {strengthChartGeometry.pathD ? (
                          <>
                            <path d={strengthChartGeometry.areaD} fill="url(#analyticsGradient)" />
                            <path
                              d={strengthChartGeometry.pathD}
                              fill="none"
                              stroke="#E44427"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeDasharray="6 3"
                            />
                          </>
                        ) : null}
                        {strengthChartGeometry.points.map((pt, i) => (
                          <circle
                            key={i}
                            cx={pt.x}
                            cy={pt.y}
                            r={i === strengthChartGeometry.points.length - 1 ? 4.5 : 3.5}
                            fill="#E44427"
                            stroke={i === strengthChartGeometry.points.length - 1 ? '#FFFFFF' : 'none'}
                            strokeWidth={i === strengthChartGeometry.points.length - 1 ? 2 : 0}
                          />
                        ))}
                      </>
                    ) : (
                      <text x="160" y="70" textAnchor="middle" className="text-xs fill-text-muted font-sans">
                        {t('progress.chartEmptySessions')}
                      </text>
                    )}
                  </svg>
                  <div className="flex justify-between text-2xs text-text-muted font-mono pt-1">
                    {getDataDateLabels(selectedExerciseAnalytics.dataPoints.map((d) => d.date)).map((m, i) => (
                      <span key={i}>{m}</span>
                    ))}
                  </div>
                  <div className="flex justify-between text-2xs text-text-muted font-mono pt-1">
                    <span>{t('progress.legendEstimated')}</span>
                    <span>{minMaxLabel(selectedExerciseAnalytics.dataPoints, userUnit) ?? ''}</span>
                  </div>
                </div>
              </div>

              {/* Last 5 Sessions Card */}
              <div className="card p-5 bg-bg-card border border-border space-y-3 shadow-xs">
                <h3 className="text-base font-bold text-text-primary font-sans">{t('progress.last5Sessions')}</h3>

                {selectedExerciseSessions.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-4 font-sans">
                    No completed sessions for {selectedExercise} yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border/60">
                    {selectedExerciseSessions.map((s, idx) => (
                      <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-text-primary font-mono block">
                            {userUnit === 'lbs' ? `${s.bestWeight} lbs` : `${s.bestWeight} kg`} × {s.bestReps} reps
                          </span>
                          <span className="text-2xs text-text-muted font-mono">
                            Est. 1RM: {userUnit === 'lbs' ? `${s.bestE1RM} lbs` : `${s.bestE1RM} kg`}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-2xs font-mono font-medium text-text-secondary block">
                            {formatShortDate(s.date)}
                          </span>
                          <span className="text-2xs font-mono text-[#5E615A] dark:text-[#A5A096] font-bold">
                            {s.deltaStr}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="animate-fade-in -mx-4 sm:mx-0">
              <PRsPage onNavigate={(tab) => onNavigate && onNavigate(tab)} />
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SCREEN 16: BODY (MEASUREMENTS)                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'body' && (
        <div className="space-y-4 animate-fade-in">
          {/* Sub-tabs: Measurements | Photos */}
          <div role="tablist" aria-label={t('progress.bodyViewsAria')} className="segmented-control" onKeyDown={tabListKeyDown((i) => setBodySubView((['measurements', 'photos'] as const)[i]))}>
            <button
              type="button"
              role="tab"
              aria-selected={bodySubView === 'measurements'}
              onClick={() => setBodySubView('measurements')}
              className={`segmented-item ${bodySubView === 'measurements' ? 'active' : ''}`}
            >
              {t('progress.tabMeasurements')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={bodySubView === 'photos'}
              onClick={() => setBodySubView('photos')}
              className={`segmented-item ${bodySubView === 'photos' ? 'active' : ''}`}
            >
              {t('progress.tabPhotos')}
            </button>
          </div>

          {bodySubView === 'measurements' ? (
            <div className="space-y-4">
              {/* Card 1: Bodyweight Trend */}
              <div className="card p-5 bg-bg-card border border-border space-y-3.5 shadow-xs">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider font-mono">
                      {t('progress.currentBodyweight')}
                    </span>
                    <div className="text-3xl sm:text-4xl font-black text-text-primary font-sans tabular-nums mt-0.5">
                      {bodyweightAnalytics.latestWeight ? `${bodyweightAnalytics.latestWeight} ${userUnit}` : '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-[#858076]/15 text-[#5E615A] dark:text-[#A5A096]">
                      {bodyweightAnalytics.deltaText}
                    </span>
                  </div>
                </div>

                {/* Range pills */}
                <div className="flex justify-end">
                  <div className="flex rounded-lg bg-bg-secondary p-0.5 border border-border/80">
                    {(['1M', '3M', '6M', '1Y'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setBodyTimeRange(r)}
                        className={`px-2 py-0.5 text-2xs font-mono font-bold rounded transition-all cursor-pointer ${
                          bodyTimeRange === r
                            ? 'bg-accent text-accent-on shadow-xs'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* SVG Trend Chart */}
                <div className="pt-1">
                  <svg viewBox="0 0 320 110" className="w-full h-28 overflow-visible" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="bodyWeightGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#858076" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#858076" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="30" x2="320" y2="30" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                    <line x1="0" y1="80" x2="320" y2="80" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                    {bodyChartGeometry.points.length > 0 ? (
                      <>
                        {bodyChartGeometry.pathD ? (
                          <>
                            <path d={bodyChartGeometry.areaD} fill="url(#bodyWeightGradient)" />
                            <path
                              d={bodyChartGeometry.pathD}
                              fill="none"
                              stroke="#858076"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            />
                          </>
                        ) : null}
                        {bodyChartGeometry.points.map((pt, i) => (
                          <circle
                            key={i}
                            cx={pt.x}
                            cy={pt.y}
                            r={i === bodyChartGeometry.points.length - 1 ? 4 : 3}
                            fill="#858076"
                            stroke={i === bodyChartGeometry.points.length - 1 ? '#FFFFFF' : 'none'}
                            strokeWidth={i === bodyChartGeometry.points.length - 1 ? 2 : 0}
                          />
                        ))}
                      </>
                    ) : (
                      <text x="160" y="60" textAnchor="middle" className="text-xs fill-text-muted font-sans">
                        {t('progress.chartEmptyBodyweight')}
                      </text>
                    )}
                  </svg>
                  <div className="flex justify-between text-2xs text-text-muted font-mono pt-1">
                    {getDataDateLabels(bodyweightAnalytics.dataPoints.map((d) => d.date)).map((m, i) => (
                      <span key={i}>{m}</span>
                    ))}
                  </div>
                  <div className="flex justify-between text-2xs text-text-muted font-mono pt-1">
                    <span>{t('progress.legendMeasured')}</span>
                    <span>{minMaxLabel(bodyweightAnalytics.dataPoints, userUnit) ?? ''}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Body Measurements */}
              <div className="card p-5 bg-bg-card border border-border space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-text-primary">{t('progress.bodyMeasurements')}</h3>
                  <button
                    type="button"
                    onClick={() => setIsWeightModalOpen(true)}
                    className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 text-text-secondary hover:text-text-primary cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-accent" />
                    <span>{t('progress.logMeasurement')}</span>
                  </button>
                </div>

                <div className="divide-y divide-border/60">
                  <div className="py-3 flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{t('progress.bodyFat')}</span>
                    <span className="font-bold text-text-primary font-mono tabular-nums text-sm">
                      {latestMetrics.bodyFatPct !== undefined ? `${latestMetrics.bodyFatPct}%` : '—'}
                    </span>
                  </div>
                  <div className="py-3 flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{t('progress.chest')}</span>
                    <span className="font-bold text-text-primary font-mono tabular-nums text-sm">
                      {latestMetrics.chestIn !== undefined
                        ? userUnit === 'lbs'
                          ? `${latestMetrics.chestIn} in`
                          : `${Math.round(latestMetrics.chestIn * 2.54)} cm`
                        : '—'}
                    </span>
                  </div>
                  <div className="py-3 flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{t('progress.waist')}</span>
                    <span className="font-bold text-text-primary font-mono tabular-nums text-sm">
                      {latestMetrics.waistIn !== undefined
                        ? userUnit === 'lbs'
                          ? `${latestMetrics.waistIn} in`
                          : `${Math.round(latestMetrics.waistIn * 2.54)} cm`
                        : '—'}
                    </span>
                  </div>
                  <div className="py-3 flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{t('progress.hips')}</span>
                    <span className="font-bold text-text-primary font-mono tabular-nums text-sm">
                      {latestMetrics.hipsIn !== undefined
                        ? userUnit === 'lbs'
                          ? `${latestMetrics.hipsIn} in`
                          : `${Math.round(latestMetrics.hipsIn * 2.54)} cm`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Photos Tab */
            <div className="space-y-4 animate-fade-in">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label={t('progress.addPhoto')}
                onChange={handlePhotoFileSelect}
              />
              {progressPhotos.length === 0 ? (
                <div className="card p-8 bg-bg-card border border-border text-center space-y-4 shadow-xs">
                  <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent mx-auto flex items-center justify-center">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-text-primary font-sans">{t('progress.photos')}</h3>
                    <p className="text-xs text-text-muted max-w-xs mx-auto">
                      {t('progress.photosHint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    className="btn-primary py-2.5 px-5 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isUploadingPhoto ? 'Adding…' : 'Add Progress Photo'}</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-text-primary font-sans">
                      {t('progress.photos')} <span className="text-text-muted font-mono text-xs">({progressPhotos.length}/24)</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-full bg-bg-secondary p-0.5" role="radiogroup" aria-label={t('progress.poseAria')}>
                        {(['Front', 'Side', 'Back'] as const).map((pose) => (
                          <button
                            key={pose}
                            type="button"
                            role="radio"
                            aria-checked={photoPose === pose}
                            onClick={() => setPhotoPose(pose)}
                            className={`px-2.5 py-1 rounded-full text-2xs font-bold cursor-pointer transition-all ${photoPose === pose ? 'bg-accent text-accent-on' : 'text-text-muted hover:text-text-primary'}`}
                          >
                            {pose}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                        className="btn-primary py-2 px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{isUploadingPhoto ? 'Adding…' : 'Add Photo'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {progressPhotos.map((photo) => (
                      <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-border bg-bg-elevated">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.dataUrl} alt={`Progress photo from ${photo.date}`} className="w-full aspect-[3/4] object-cover" />
                        <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-black/55 text-[0.625rem] font-mono text-white flex items-center justify-between">
                          <span>{formatProgressDate(photo.date)}{photo.label ? ` · ${photo.label}` : ''}</span>
                          <button
                            type="button"
                            aria-label={`Delete photo from ${photo.date}`}
                            onClick={() => setPhotoPendingDelete(photo)}
                            className="p-1 rounded hover:bg-white/20 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-2xs text-text-muted font-mono text-center">
                    {t('progress.photosDeviceNote')}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SCREEN 17: CONSISTENCY                                                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'consistency' && (
        <div className="space-y-4 animate-fade-in">
          {/* Sub-tabs: Overview | Streaks */}
          <div role="tablist" aria-label={t('progress.consistencyViewsAria')} className="segmented-control" onKeyDown={tabListKeyDown((i) => setConsistencySubView((['overview', 'streaks'] as const)[i]))}>
            <button
              type="button"
              role="tab"
              aria-selected={consistencySubView === 'overview'}
              onClick={() => setConsistencySubView('overview')}
              className={`segmented-item ${consistencySubView === 'overview' ? 'active' : ''}`}
            >
              {t('progress.tabOverview')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={consistencySubView === 'streaks'}
              onClick={() => setConsistencySubView('streaks')}
              className={`segmented-item ${consistencySubView === 'streaks' ? 'active' : ''}`}
            >
              {t('progress.tabStreaks')}
            </button>
          </div>

          {consistencySubView === 'overview' ? (
            <div className="space-y-4">
              {/* Card 1: Current Streak */}
              <div className="card p-5 bg-bg-card border border-border space-y-4 shadow-xs">
                <div>
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider font-mono">
                    {t('progress.currentStreak')}
                  </span>
                  <div className="text-4xl font-black text-text-primary font-sans tabular-nums mt-0.5">
                    {consistencyStats.streakDays} {t(consistencyStats.streakDays === 1 ? 'progress.dayOne' : 'progress.dayMany')}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {consistencyStats.streakDays > 0 ? t('progress.streakKeepGoing') : t('progress.streakStart')}
                  </p>
                </div>

                {/* 7 Day Circles (Sage Green) */}
                <div className="flex justify-between items-center pt-2">
                  {consistencyStats.dayBars.map((bar, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-1.5">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs font-mono transition-all ${
                          bar.isCompleted
                            ? 'bg-[#858076] text-white shadow-xs'
                            : 'bg-bg-secondary border border-border/80 text-text-muted'
                        }`}
                      >
                        {bar.isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : null}
                      </div>
                      <span className="text-2xs font-mono text-text-muted">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 2: Last 7 Days (Bar Chart) */}
              <div className="card p-5 bg-bg-card border border-border space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-text-primary font-sans">{t('progress.last7Days')}</h3>
                  <span className="text-xs font-mono font-bold text-text-secondary">
                    {consistencyStats.thisWeekCompleted}/{consistencyStats.thisWeekTarget} workouts
                  </span>
                </div>

                {/* 7 Vertical Day Bars */}
                <div className="flex justify-between items-end h-28 pt-2 px-2">
                  {consistencyStats.dayBars.map((bar, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-2 h-full justify-end">
                      <div className="w-6 sm:w-7 bg-bg-secondary rounded-lg overflow-hidden flex flex-col justify-end h-20">
                        <div
                          style={{ height: `${bar.heightPct}%` }}
                          className={`w-full rounded-lg transition-all ${
                            bar.isCompleted ? 'bg-accent' : 'bg-border/60'
                          }`}
                        />
                      </div>
                      <span className="text-2xs font-mono font-semibold text-text-muted">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 3b: Muscle Volume + Recovery (toggleable in Settings) */}
              <MuscleVolumeSection workouts={workouts} />

              {/* Card 3: Last 4 Weeks */}
              <div className="card p-5 bg-bg-card border border-border space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-text-primary font-sans">{t('progress.last4Weeks')}</h3>
                  <span className="text-xs font-mono font-bold text-[#5E615A] dark:text-[#A5A096]">
                    {consistencyStats.fourWeeksCompleted}/{consistencyStats.fourWeeksTarget} workouts ({consistencyStats.consistencyPct}%)
                  </span>
                </div>

                {/* 4 Week Progress Bars */}
                <div className="space-y-2 pt-1 text-xs font-mono">
                  {consistencyStats.fourWeeksBreakdown.map((w, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-2xs">
                        <span className="text-text-secondary">{w.label}</span>
                        <span className="text-text-primary font-bold">{w.count}/{w.target}</span>
                      </div>
                      <div className="h-2 w-full bg-bg-secondary rounded-full overflow-hidden">
                        <div
                          style={{ width: `${w.pct}%` }}
                          className={`h-full rounded-full ${
                            w.pct >= 80 ? 'bg-[#858076]' : 'bg-accent'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Streaks / Full Heatmap Tab */
            <div className="card p-4 bg-bg-card border border-border space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-text-primary">{t('progress.habitMatrix')}</h3>
                  <p className="text-2xs text-text-muted">{t('progress.habitMatrixHint')}</p>
                </div>
              </div>
              <WorkoutHeatmap />
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ────────────────────────────────────────────────────────── */}
      <BodyMetricsModal isOpen={isWeightModalOpen} onClose={() => setIsWeightModalOpen(false)} />
      <MeetAttemptPlannerModal isOpen={isMeetModalOpen} onClose={() => setIsMeetModalOpen(false)} />
      <WeeklyRecapModal isOpen={isWeeklyRecapOpen} onClose={() => setIsWeeklyRecapOpen(false)} />

      {/* Progress photo deletion always asks first — never instant */}
      <ConfirmationModal
        isOpen={photoPendingDelete !== null}
        onClose={() => setPhotoPendingDelete(null)}
        onConfirm={() => {
          if (photoPendingDelete) {
            removeProgressPhoto(photoPendingDelete.id);
            toast.info(t('progress.photoDeletedMsg'), t('progress.photoRemovedTitle'));
          }
          setPhotoPendingDelete(null);
        }}
        title={t('progress.deletePhotoTitle')}
        message={t('progress.deletePhotoMsg')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
        icon="trash"
      />

      {/* Tools Drawer */}
      {isToolsMenuOpen && (
        <div ref={toolsMenuRef} {...toolsMenuDialogProps}
          className="modal-overlay z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setIsToolsMenuOpen(false)}
        >
          <div
            className="modal-content w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-text-primary text-base">{t('progress.tools')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsToolsMenuOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                aria-label={t('progress.closeTools')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-bg-secondary border border-border flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-text-primary">{t('progress.displayUnits')}</h4>
                  <p className="text-2xs text-text-muted">{t('progress.displayUnitsHint', { unit: userUnit.toUpperCase() })}</p>
                </div>
                <div className="flex rounded-lg bg-bg-card p-0.5 border border-border/80">
                  <button
                    type="button"
                    onClick={() => {
                      if (profile) setProfile({ ...profile, unit: 'lbs' });
                    }}
                    className={`px-3 py-1 text-2xs font-mono font-bold rounded transition-all cursor-pointer ${
                      userUnit === 'lbs' ? 'bg-accent text-accent-on shadow-xs' : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    LBS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (profile) setProfile({ ...profile, unit: 'kg' });
                    }}
                    className={`px-3 py-1 text-2xs font-mono font-bold rounded transition-all cursor-pointer ${
                      userUnit === 'kg' ? 'bg-accent text-accent-on shadow-xs' : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    KG
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsWeeklyRecapOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent-text transition-colors">
                      {t('progress.weeklyShareCard')}
                    </h4>
                    <p className="text-2xs text-text-muted">{t('progress.exportCardHint')}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsWeightModalOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#858076]/20 text-[#5E615A] dark:text-[#A5A096] flex items-center justify-center shrink-0">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent-text transition-colors">
                      {t('progress.logBodyweightMeasurements')}
                    </h4>
                    <p className="text-2xs text-text-muted">{t('progress.measurementsHint')}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsMeetModalOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent-text transition-colors">
                      {t('progress.meetPlanner')}
                    </h4>
                    <p className="text-2xs text-text-muted">{t('progress.meetHint')}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsDotsInfoOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-bg-secondary hover:bg-bg-secondary/80 border border-border flex items-center justify-between transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent-text transition-colors">
                      {t('progress.dotsStandards')}
                    </h4>
                    <p className="text-2xs text-text-muted">
                      {dotsScore > 0 ? t('progress.dotsCurrent', { score: Math.round(dotsScore), tier: dotsClassification.tier }) : t('progress.dotsFormulaShort')}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOTS Modal */}
      {isDotsInfoOpen && (
        <div ref={dotsInfoRef} {...dotsInfoDialogProps} className="modal-overlay" onClick={() => setIsDotsInfoOpen(false)}>
          <div
            className="modal-content max-w-md w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">{t('progress.dotsTitle')}</h3>
                  <p className="text-2xs text-text-muted">{t('progress.dotsHint')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDotsInfoOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary"
                aria-label={t('progress.closeDots')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-text-secondary leading-relaxed font-sans">
              <p>
                {t('progress.dotsExplainer')}
              </p>
              <div className="card p-3 bg-bg-secondary/70 border border-border/80 space-y-1 text-2xs font-mono">
                <div className="flex justify-between py-0.5 border-b border-border/40">
                  <span className="text-text-muted">&lt; 250</span>
                  <span className="font-semibold text-text-primary">{t('progress.tierNovice')}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-border/40">
                  <span className="text-text-muted">250 – 349</span>
                  <span className="font-semibold text-text-primary">{t('progress.tierIntermediate')}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-border/40">
                  <span className="text-text-muted">350 – 424</span>
                  <span className="font-semibold text-accent">{t('progress.tierAdvanced')}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-border/40">
                  <span className="text-text-muted">425 – 499</span>
                  <span className="font-semibold text-amber-500">{t('progress.tierElite')}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-text-muted">500+</span>
                  <span className="font-bold text-emerald-500">{t('progress.tierWorldClass')}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDotsInfoOpen(false)}
              className="w-full btn-primary py-2.5 text-xs font-bold"
            >
              {t('progress.gotIt')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
