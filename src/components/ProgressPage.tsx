'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { isSetCompleted, BodyMetricEntry, WorkoutEntry } from '@/lib/types';
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
import { getExerciseHistorySessions } from '@/lib/lifter-twin';
import WorkoutHeatmap from '@/components/WorkoutHeatmap';
import PRsPage from '@/components/PRsPage';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import MeetAttemptPlannerModal from '@/components/MeetAttemptPlannerModal';
import WeeklyRecapModal from '@/components/WeeklyRecapModal';
import { plural, safeRandomId, getLocalTodayStr } from '@/lib/formatters';
import { useAppNavigation } from '@/lib/navigation';
import { useToast } from '@/components/ui/Toast';
import { resizeAndCompressImage } from '@/lib/image-processing';

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
    const p = points[0];
    const pathD = `M ${padX} ${p.y} L ${width - padX} ${p.y}`;
    const areaD = `M ${padX} ${p.y} L ${width - padX} ${p.y} L ${width - padX} ${height} L ${padX} ${height} Z`;
    return { pathD, areaD, points, min, max };
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

function getMonthLabelsForRange(range: '1M' | '3M' | '6M' | '1Y'): string[] {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (range === '1M') {
    return ['Week 1', 'Week 2', 'Week 3', 'Today'];
  }
  const count = range === '3M' ? 3 : range === '6M' ? 6 : 12;
  const result: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(months[d.getMonth()]);
  }
  if (count === 12) {
    return [result[0], result[2], result[4], result[6], result[8], result[11]];
  }
  return result;
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
  const [strengthTimeRange, setStrengthTimeRange] = useState<'1M' | '3M' | '6M' | '1Y'>('3M');

  // Time range control for Screen 16 (Bodyweight Trend)
  const [bodyTimeRange, setBodyTimeRange] = useState<'1M' | '3M' | '6M' | '1Y'>('3M');

  // Auxiliary modals
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isMeetModalOpen, setIsMeetModalOpen] = useState(false);
  const [isWeeklyRecapOpen, setIsWeeklyRecapOpen] = useState(false);
  const [isDotsInfoOpen, setIsDotsInfoOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);

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
  const toast = useToast();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

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
      addProgressPhoto({
        id: safeRandomId('photo'),
        dataUrl,
        date: getLocalTodayStr(),
      });
      toast.success('Progress photo saved locally.', 'Photo Added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the photo.', 'Upload Failed');
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

  // Synchronize active sub-tab with URL and localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const currentSub = activeTab === 'strength' && strengthSubView === 'records' ? 'prs' : activeTab;
      localStorage.setItem('ascend_progress_subtab', currentSub);
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
    const sessions = getExerciseHistorySessions(heroLift.name, workouts, userUnit);
    const prMatches = prs
      .filter((p) => p.exercise.toLowerCase().includes(heroLift.name.toLowerCase()))
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
    const sessions = getExerciseHistorySessions(selectedExercise, workouts, userUnit);
    if (sessions && sessions.length > 0) {
      return [...sessions].reverse().slice(0, 5).map((s, idx, arr) => {
        let deltaStr = 'Completed';
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
    }

    // Check if PR entries exist for this exercise
    const prMatches = prs
      .filter((p) => p.exercise.toLowerCase().includes(selectedExercise.toLowerCase()))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    if (prMatches.length > 0) {
      return prMatches.map((p, idx, arr) => {
        const val = userUnit === 'lbs' ? p.weightLbs : p.weightKg;
        const e1rm = Math.round(calculateOneRepMax(val, p.reps) * 10) / 10;
        let deltaStr = 'PR Log';
        if (idx < arr.length - 1) {
          const prevVal = userUnit === 'lbs' ? arr[idx + 1].weightLbs : arr[idx + 1].weightKg;
          const prevE1RM = calculateOneRepMax(prevVal, arr[idx + 1].reps);
          if (prevE1RM > 0) {
            const diffPct = Math.round(((e1rm - prevE1RM) / prevE1RM) * 100);
            deltaStr = `${diffPct >= 0 ? '+' : ''}${diffPct}%`;
          }
        }
        return {
          date: p.date,
          bestWeight: Math.round(val * 10) / 10,
          bestReps: p.reps,
          bestE1RM: e1rm,
          deltaStr,
          hasData: true,
        };
      });
    }

    return [];
  }, [selectedExercise, workouts, prs, userUnit]);

  // Selected exercise 1RM and filtered progress chart for Screen 15
  const selectedExerciseAnalytics = useMemo(() => {
    const rawSessions = getExerciseHistorySessions(selectedExercise, workouts, userUnit);
    const prMatches = prs
      .filter((p) => p.exercise.toLowerCase().includes(selectedExercise.toLowerCase()))
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
      const latest = dataPoints[dataPoints.length - 1].value;
      const first = dataPoints[0].value;
      const delta = latest - first;
      const pct = first > 0 ? (delta / first) * 100 : 0;
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

    // This week (Monday to Sunday)
    const dayOfWeek = (today.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek);
    monday.setHours(0, 0, 0, 0);

    const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    let thisWeekCompleted = 0;
    const dayBars = weekDays.map((label, idx) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + idx);
      const dStr = getLocalDateStr(d);
      const isCompleted = workoutDays.has(dStr);
      if (isCompleted) thisWeekCompleted++;

      return {
        label,
        dateStr: dStr,
        isCompleted,
        heightPct: isCompleted ? 85 : 15,
      };
    });

    // 4 rolling weeks calculation
    const weeklyTarget = 5;
    let fourWeeksCompleted = 0;
    const fourWeeksBreakdown: { label: string; count: number; target: number; pct: number }[] = [];

    for (let w = 0; w < 4; w++) {
      const wStart = new Date(monday);
      wStart.setDate(monday.getDate() - (w * 7));

      let count = 0;
      for (let d = 0; d < 7; d++) {
        const checkD = new Date(wStart);
        checkD.setDate(wStart.getDate() + d);
        if (workoutDays.has(getLocalDateStr(checkD))) {
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
  }, [workouts]);

  // DOTS calculation for powerlifting modal
  const bigThreeStats = useMemo(() => getBigThreeStats(prs), [prs]);
  const dotsScore = useMemo(() => {
    if (!profile || !profile.bodyweightKg || bigThreeStats.totalKg === 0) return 0;
    return calculateDOTS(profile.bodyweightKg, bigThreeStats.totalKg, profile.gender);
  }, [profile, bigThreeStats.totalKg]);
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
              aria-label="Back to Progress Overview"
            >
              <ChevronLeft className="w-5 h-5 text-accent" />
            </button>
          ) : activeTab !== 'strength' ? (
            <button
              type="button"
              onClick={() => setActiveTab('strength')}
              className="p-2 min-h-[44px] min-w-[44px] -ml-1 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card border border-border/50 hover:border-accent/40 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              aria-label="Back to Strength Overview"
            >
              <ChevronLeft className="w-5 h-5 text-accent" />
            </button>
          ) : canGoBack ? (
            <button
              type="button"
              onClick={goBack}
              className="p-2 min-h-[44px] min-w-[44px] -ml-1 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card border border-border/50 hover:border-accent/40 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              aria-label="Go back"
            >
              <ChevronLeft className="w-5 h-5 text-accent" />
            </button>
          ) : null}

          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-sans text-text-primary tracking-tight">
              {activeTab === 'strength' && strengthSubView === 'overview'
                ? 'Progress'
                : activeTab === 'strength'
                ? 'Strength'
                : activeTab === 'body'
                ? 'Body'
                : 'Consistency'}
            </h1>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsWeeklyRecapOpen(true)}
            className="p-2 min-h-[44px] min-w-[44px] rounded-xl bg-bg-card border border-border text-text-secondary hover:text-accent transition-colors flex items-center justify-center cursor-pointer shadow-xs"
            title="Generate Weekly Training Card"
            aria-label="Generate Weekly Training Card"
          >
            <Share2 className="w-4 h-4 text-accent" />
          </button>
          <button
            type="button"
            onClick={() => setIsToolsMenuOpen(true)}
            className="p-2 min-h-[44px] min-w-[44px] rounded-xl bg-bg-card border border-border text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center cursor-pointer shadow-xs"
            title="Analytics Tools & Actions"
            aria-label="Analytics Tools"
          >
            <SlidersHorizontal className="w-4 h-4 text-accent" />
          </button>
        </div>
      </header>

      {/* ── TOP SEGMENTED CONTROL: STRENGTH | BODY | CONSISTENCY ───────────── */}
      {/* Visible on Screen 14 overview */}
      {activeTab === 'strength' && strengthSubView === 'overview' && (
        <div role="tablist" aria-label="Progress views" className="segmented-control">
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
              {tabKey === 'strength' ? 'Strength' : tabKey === 'body' ? 'Body' : 'Consistency'}
            </button>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SCREEN 14: PROGRESS OVERVIEW                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'strength' && strengthSubView === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          {/* Card 1: Strength Progress (Area Chart) */}
          <div
            onClick={() => {
              setSelectedExercise(heroLift.name);
              setStrengthSubView('analytics');
            }}
            className="card p-5 bg-bg-card border border-border space-y-3 cursor-pointer hover:border-accent/40 transition-all shadow-xs group"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-text-primary">Strength Progress</h2>
                <span className="text-xs font-semibold text-text-secondary">{heroLift.name}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div>
                <div className="text-3xl font-black text-text-primary font-sans tabular-nums">
                  {heroLiftAnalytics.latest1RM ? `${heroLiftAnalytics.latest1RM} ${userUnit}` : displayWeight(heroLift.best1RMKg)}
                </div>
                <span className="text-2xs text-text-muted font-mono">Current 1RM</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-[#858076]/15 text-[#858076]">
                {heroLiftAnalytics.deltaText}
              </span>
            </div>

            {/* Dynamic Smooth Area Chart */}
            <div className="pt-2">
              <svg viewBox="0 0 320 120" className="w-full h-28 overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="strengthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E44427" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#E44427" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <line x1="0" y1="90" x2="320" y2="90" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="3 3" />
                {heroChartGeometry.pathD ? (
                  <>
                    <path d={heroChartGeometry.areaD} fill="url(#strengthGradient)" />
                    <path
                      d={heroChartGeometry.pathD}
                      fill="none"
                      stroke="#E44427"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
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
                    Log workout sessions to render progression curve
                  </text>
                )}
              </svg>
              {/* Dynamic 6-month axis labels */}
              <div className="flex justify-between text-3xs text-text-muted font-mono pt-1">
                {getMonthLabelsForRange('6M').map((m, i) => (
                  <span key={i}>{m}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Card 2: Personal Records List */}
          <div className="card p-5 bg-bg-card border border-border space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-text-primary">Personal Records</h2>
              <button
                type="button"
                onClick={() => setStrengthSubView('records')}
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>View All</span>
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
          <div role="tablist" aria-label="Strength views" className="segmented-control">
            <button
              type="button"
              role="tab"
              aria-selected={strengthSubView === 'analytics'}
              onClick={() => setStrengthSubView('analytics')}
              className={`segmented-item ${strengthSubView === 'analytics' ? 'active' : ''}`}
            >
              Progress
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={strengthSubView === 'records'}
              onClick={() => setStrengthSubView('records')}
              className={`segmented-item ${strengthSubView === 'records' ? 'active' : ''}`}
            >
              Records
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
                            ? 'bg-accent text-white shadow-xs'
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
                    <div className="text-4xl font-black text-text-primary font-sans tabular-nums">
                      {selectedExerciseAnalytics.latest1RM ? `${selectedExerciseAnalytics.latest1RM} ${userUnit}` : '—'}
                    </div>
                    <span className="text-2xs text-text-muted font-mono">Estimated 1RM</span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-[#858076]/15 text-[#858076]">
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
                    {strengthChartGeometry.pathD ? (
                      <>
                        <path d={strengthChartGeometry.areaD} fill="url(#analyticsGradient)" />
                        <path
                          d={strengthChartGeometry.pathD}
                          fill="none"
                          stroke="#E44427"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
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
                        No session data in this timeframe
                      </text>
                    )}
                  </svg>
                  <div className="flex justify-between text-3xs text-text-muted font-mono pt-1">
                    {getMonthLabelsForRange(strengthTimeRange).map((m, i) => (
                      <span key={i}>{m}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Last 5 Sessions Card */}
              <div className="card p-5 bg-bg-card border border-border space-y-3 shadow-xs">
                <h3 className="text-base font-bold text-text-primary font-sans">Last 5 Sessions</h3>

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
                          <span className="text-3xs text-text-muted font-mono">
                            Est. 1RM: {userUnit === 'lbs' ? `${s.bestE1RM} lbs` : `${s.bestE1RM} kg`}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-2xs font-mono font-medium text-text-secondary block">
                            {formatShortDate(s.date)}
                          </span>
                          <span className="text-3xs font-mono text-[#858076] font-bold">
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
          <div role="tablist" aria-label="Body views" className="segmented-control">
            <button
              type="button"
              role="tab"
              aria-selected={bodySubView === 'measurements'}
              onClick={() => setBodySubView('measurements')}
              className={`segmented-item ${bodySubView === 'measurements' ? 'active' : ''}`}
            >
              Measurements
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={bodySubView === 'photos'}
              onClick={() => setBodySubView('photos')}
              className={`segmented-item ${bodySubView === 'photos' ? 'active' : ''}`}
            >
              Photos
            </button>
          </div>

          {bodySubView === 'measurements' ? (
            <div className="space-y-4">
              {/* Card 1: Bodyweight Trend */}
              <div className="card p-5 bg-bg-card border border-border space-y-3.5 shadow-xs">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider font-mono">
                      CURRENT BODYWEIGHT
                    </span>
                    <div className="text-3xl sm:text-4xl font-black text-text-primary font-sans tabular-nums mt-0.5">
                      {bodyweightAnalytics.latestWeight ? `${bodyweightAnalytics.latestWeight} ${userUnit}` : '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-[#858076]/15 text-[#858076]">
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
                            ? 'bg-accent text-white shadow-xs'
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
                        Log bodyweight check-ins to track trend
                      </text>
                    )}
                  </svg>
                  <div className="flex justify-between text-3xs text-text-muted font-mono pt-1">
                    {getMonthLabelsForRange(bodyTimeRange).map((m, i) => (
                      <span key={i}>{m}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 2: Body Measurements */}
              <div className="card p-5 bg-bg-card border border-border space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-text-primary">Body Measurements</h3>
                  <button
                    type="button"
                    onClick={() => setIsWeightModalOpen(true)}
                    className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 text-text-secondary hover:text-text-primary cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-accent" />
                    <span>Log Measurement</span>
                  </button>
                </div>

                <div className="divide-y divide-border/60">
                  <div className="py-3 flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Body Fat</span>
                    <span className="font-bold text-text-primary font-mono tabular-nums text-sm">
                      {latestMetrics.bodyFatPct !== undefined ? `${latestMetrics.bodyFatPct}%` : '—'}
                    </span>
                  </div>
                  <div className="py-3 flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Chest</span>
                    <span className="font-bold text-text-primary font-mono tabular-nums text-sm">
                      {latestMetrics.chestIn !== undefined
                        ? userUnit === 'lbs'
                          ? `${latestMetrics.chestIn} in`
                          : `${Math.round(latestMetrics.chestIn * 2.54)} cm`
                        : '—'}
                    </span>
                  </div>
                  <div className="py-3 flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Waist</span>
                    <span className="font-bold text-text-primary font-mono tabular-nums text-sm">
                      {latestMetrics.waistIn !== undefined
                        ? userUnit === 'lbs'
                          ? `${latestMetrics.waistIn} in`
                          : `${Math.round(latestMetrics.waistIn * 2.54)} cm`
                        : '—'}
                    </span>
                  </div>
                  <div className="py-3 flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Hips</span>
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
                capture="environment"
                className="hidden"
                aria-label="Add progress photo"
                onChange={handlePhotoFileSelect}
              />
              {progressPhotos.length === 0 ? (
                <div className="card p-8 bg-bg-card border border-border text-center space-y-4 shadow-xs">
                  <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent mx-auto flex items-center justify-center">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-text-primary font-sans">Progress Photos</h3>
                    <p className="text-xs text-text-muted max-w-xs mx-auto">
                      Take front, side, and back photos to track muscular definition and body transformation over time.
                      Photos stay on this device.
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
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-text-primary font-sans">
                      Progress Photos <span className="text-text-muted font-mono text-xs">({progressPhotos.length})</span>
                    </h3>
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {progressPhotos.map((photo) => (
                      <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-border bg-bg-elevated">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.dataUrl} alt={`Progress photo from ${photo.date}`} className="w-full aspect-[3/4] object-cover" />
                        <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-black/55 text-[10px] font-mono text-white flex items-center justify-between">
                          <span>{formatProgressDate(photo.date)}</span>
                          <button
                            type="button"
                            aria-label={`Delete photo from ${photo.date}`}
                            onClick={() => {
                              removeProgressPhoto(photo.id);
                              toast.info('Progress photo deleted.', 'Photo Removed');
                            }}
                            className="p-1 rounded hover:bg-white/20 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-2xs text-text-muted font-mono text-center">
                    Photos are stored only on this device and never uploaded.
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
          <div role="tablist" aria-label="Consistency views" className="segmented-control">
            <button
              type="button"
              role="tab"
              aria-selected={consistencySubView === 'overview'}
              onClick={() => setConsistencySubView('overview')}
              className={`segmented-item ${consistencySubView === 'overview' ? 'active' : ''}`}
            >
              Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={consistencySubView === 'streaks'}
              onClick={() => setConsistencySubView('streaks')}
              className={`segmented-item ${consistencySubView === 'streaks' ? 'active' : ''}`}
            >
              Streaks
            </button>
          </div>

          {consistencySubView === 'overview' ? (
            <div className="space-y-4">
              {/* Card 1: Current Streak */}
              <div className="card p-5 bg-bg-card border border-border space-y-4 shadow-xs">
                <div>
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider font-mono">
                    CURRENT STREAK
                  </span>
                  <div className="text-4xl font-black text-text-primary font-sans tabular-nums mt-0.5">
                    {consistencyStats.streakDays} {consistencyStats.streakDays === 1 ? 'day' : 'days'}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {consistencyStats.streakDays > 0 ? 'Keep the momentum going' : 'Log a workout today to start your streak!'}
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
                      <span className="text-3xs font-mono text-text-muted">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 2: This Week (Bar Chart) */}
              <div className="card p-5 bg-bg-card border border-border space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-text-primary font-sans">This Week</h3>
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
                            bar.isCompleted ? 'bg-[#E44427]' : 'bg-border/60'
                          }`}
                        />
                      </div>
                      <span className="text-2xs font-mono font-semibold text-text-muted">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 3: Last 4 Weeks */}
              <div className="card p-5 bg-bg-card border border-border space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-text-primary font-sans">Last 4 Weeks</h3>
                  <span className="text-xs font-mono font-bold text-[#858076]">
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
                  <h3 className="text-base font-bold text-text-primary">Habit &amp; Workout Matrix</h3>
                  <p className="text-2xs text-text-muted">Accountability across gym, water, protein, creatine</p>
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

      {/* Tools Drawer */}
      {isToolsMenuOpen && (
        <div
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
                <h3 className="font-bold text-text-primary text-base">Progress Tools</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsToolsMenuOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                aria-label="Close progress tools"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-bg-secondary border border-border flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-text-primary">Display Units</h4>
                  <p className="text-2xs text-text-muted">Currently displaying in {userUnit.toUpperCase()}</p>
                </div>
                <div className="flex rounded-lg bg-bg-card p-0.5 border border-border/80">
                  <button
                    type="button"
                    onClick={() => {
                      if (profile) setProfile({ ...profile, unit: 'lbs' });
                    }}
                    className={`px-3 py-1 text-2xs font-mono font-bold rounded transition-all cursor-pointer ${
                      userUnit === 'lbs' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text-primary'
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
                      userUnit === 'kg' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text-primary'
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
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">
                      Weekly Share Card
                    </h4>
                    <p className="text-2xs text-text-muted">Export visual progress card for WhatsApp &amp; Instagram</p>
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
                  <div className="w-9 h-9 rounded-lg bg-[#858076]/20 text-[#858076] flex items-center justify-center shrink-0">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">
                      Log Bodyweight &amp; Measurements
                    </h4>
                    <p className="text-2xs text-text-muted">Weight, chest, waist, and hips measurements</p>
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
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">
                      Meet Attempt Planner
                    </h4>
                    <p className="text-2xs text-text-muted">Plan competition attempts: Opener, 2nd &amp; 3rd lifts</p>
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
                    <h4 className="text-xs font-bold text-text-primary group-hover:text-accent transition-colors">
                      DOTS Score &amp; Standards
                    </h4>
                    <p className="text-2xs text-text-muted">
                      {dotsScore > 0 ? `Current: ${Math.round(dotsScore)} (${dotsClassification.tier})` : 'Pound-for-pound strength formula'}
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
        <div className="modal-overlay" onClick={() => setIsDotsInfoOpen(false)}>
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
                  <h3 className="text-sm font-bold text-text-primary">What is the DOTS Score?</h3>
                  <p className="text-2xs text-text-muted">Standardized pound-for-pound strength formula</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDotsInfoOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary"
                aria-label="Close DOTS info"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-text-secondary leading-relaxed font-sans">
              <p>
                The <strong>DOTS formula</strong> is the official standard used by the International Powerlifting Federation (IPF). It normalizes strength against bodyweight using a polynomial curve, allowing lifters of different bodyweights and genders to fairly compare strength.
              </p>
              <div className="card p-3 bg-bg-secondary/70 border border-border/80 space-y-1 text-2xs font-mono">
                <div className="flex justify-between py-0.5 border-b border-border/40">
                  <span className="text-text-muted">&lt; 250</span>
                  <span className="font-semibold text-text-primary">Novice</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-border/40">
                  <span className="text-text-muted">250 – 349</span>
                  <span className="font-semibold text-text-primary">Intermediate</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-border/40">
                  <span className="text-text-muted">350 – 424</span>
                  <span className="font-semibold text-accent">Advanced</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-border/40">
                  <span className="text-text-muted">425 – 499</span>
                  <span className="font-semibold text-amber-500">Elite</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-text-muted">500+</span>
                  <span className="font-bold text-emerald-500">World Class</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDotsInfoOpen(false)}
              className="w-full btn-primary py-2.5 text-xs font-bold"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
