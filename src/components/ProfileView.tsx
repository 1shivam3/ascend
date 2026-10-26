'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  User,
  Target,
  Bell,
  Database,
  Share2,
  Trophy,
  MessageSquare,
  LogOut,
  Edit2,
  Activity,
  ShieldCheck,
} from 'lucide-react';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import { getLiftLevel, getOverallLevel } from '@/lib/strength-standards';
import { formatHeightImperial, plural } from '@/lib/formatters';
import { ATHLETE_GOAL_CONFIGS } from '@/lib/types';
import { useAppNavigation } from '@/lib/navigation';
import { useTranslation } from '@/lib/i18n';
import EditProfileModal from '@/components/EditProfileModal';
import GoalSelectorModal from '@/components/GoalSelectorModal';
import ReminderCenterModal from '@/components/ReminderCenterModal';
import DataVaultModal from '@/components/DataVaultModal';
import FeedbackModal from '@/components/FeedbackModal';
import WeeklyRecapModal from '@/components/WeeklyRecapModal';
import ShareProgramModal from '@/components/ShareProgramModal';

export interface ProfileViewProps {
  onBack?: () => void;
  onNavigate?: (tab: 'home' | 'workout' | 'progress' | 'meals' | 'prs' | 'profile' | 'settings') => void;
}

export default function ProfileView({ onBack, onNavigate }: ProfileViewProps) {
  const storeProfile = useStore((state) => state.profile);
  const profile = storeProfile ?? useStore.getState().profile;
  const plannedWorkouts = useStore((state) => state.plannedWorkouts || []);
  const prs = useStore((state) => state.prs || []);
  const goals = useStore((state) => state.goals || []);
  const toast = useToast();
  const { t } = useTranslation();

  const { goBack, canGoBack } = useAppNavigation();
  const { user } = useSupabaseSync();

  // Modals
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isGoalSelectorOpen, setIsGoalSelectorOpen] = useState(false);
  const [isReminderCenterOpen, setIsReminderCenterOpen] = useState(false);
  const [isDataVaultOpen, setIsDataVaultOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isWeeklyRecapOpen, setIsWeeklyRecapOpen] = useState(false);
  const [sharePlan, setSharePlan] = useState<(typeof plannedWorkouts)[number] | null>(null);
  const [isSharePickerOpen, setIsSharePickerOpen] = useState(false);
  const sharePickerRef = useRef<HTMLDivElement>(null); const { dialogProps: sharePickerDialogProps } = useModalA11y(sharePickerRef, isSharePickerOpen, () => setIsSharePickerOpen(false));

  // Sharing must never silently pick the first plan — a coach sharing
  // from here sent clients the WRONG program. Ask which plan, unless
  // there is exactly one.
  const handleShareSplit = () => {
    if (plannedWorkouts.length === 0) {
      toast.info(t('profile.noPlansMsg'), t('profile.noPlansTitle'));
      return;
    }
    if (plannedWorkouts.length === 1) {
      setSharePlan(plannedWorkouts[0]);
      return;
    }
    setIsSharePickerOpen(true);
  };

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else if (canGoBack) {
      goBack();
    } else if (onNavigate) {
      onNavigate('home');
    }
  }, [onBack, canGoBack, goBack, onNavigate]);

  // NOTE: no system-back handler is registered in page mode. Tab-level back is
  // already handled by the navigation stack; registering handleBack here would
  // recurse (handleBack -> goBack -> runBackHandlers -> handleBack ...).

  const athleteName = profile?.name ? profile.name.trim() : 'Alex';
  const athleteInitial = athleteName.charAt(0).toUpperCase();

  // Real athlete tier from the strength-level system (best 1RM per exercise →
  // per-lift levels → overall title). Falls back to INITIATE with no PRs.
  const athleteTier = useMemo(() => {
    const bestByExercise = new Map<string, number>();
    for (const pr of prs) {
      if (pr.isBaseline) continue;
      const key = pr.exercise.toLowerCase();
      const prev = bestByExercise.get(key) || 0;
      if (pr.weightKg > prev) bestByExercise.set(key, pr.weightKg);
    }
    const levels = Array.from(bestByExercise.entries()).map(([exercise, best1RMKg]) =>
      getLiftLevel(exercise, best1RMKg, profile?.bodyweightKg || 70, profile?.gender || 'male')
    );
    // Lifts with no published standard are estimates and are excluded
    // from the overall level — the profile must SAY so (the PR page
    // does; this page silently showed the blended number).
    const estimatedCount = levels.filter((l) => l.isStandardUnavailable).length;
    return { ...getOverallLevel(levels), estimatedCount, totalLifts: levels.length };
  }, [prs, profile?.bodyweightKg, profile?.gender]);
  // UX #13: never show a fabricated email. The old line built
  // "<name>@athlete.local" for guests — a plausible-looking address
  // that is not theirs and could be mistaken for one. Guests see the
  // guest label; signed-in users see their real account email.
  const athleteEmail = user?.email || t('common.guestAthlete');
  const userUnit = profile?.unit || 'lbs';

  // Format height display
  const displayHeight = () => {
    if (!profile?.heightCm) return '—';
    if (userUnit === 'lbs') {
      return formatHeightImperial(profile.heightCm);
    }
    return `${Math.round(profile.heightCm)} cm`;
  };

  // Format weight display
  const displayWeight = () => {
    if (!profile?.bodyweightKg) return '—';
    if (userUnit === 'lbs') {
      const lbs = profile.bodyweightLbs || Math.round(profile.bodyweightKg * 2.20462);
      return `${lbs} lbs`;
    }
    return `${profile.bodyweightKg} kg`;
  };

  // Format age display
  const displayAge = () => {
    return profile?.age ? `${profile.age}` : '—';
  };

  return (
    <div className="page animate-fade-in space-y-5 pb-24 max-w-md mx-auto px-5 pt-3">
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="p-2 min-h-[44px] min-w-[44px] -ml-1 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card border border-border/50 hover:border-accent/40 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
            aria-label={t('profile.back')}
          >
            <ChevronLeft className="w-5 h-5 text-accent" />
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold font-sans text-text-primary tracking-tight">
            {t('profile.title')}
          </h1>
        </div>

        {/* UX #7: no header gear — Settings already has its own row
            below (and its own tab). A duplicate top-right gear is
            exactly the clutter the minimal-by-default rule removes. */}
      </header>

      {/* ── Screen 22: Athlete Identity Hero Card ───────────────────────────── */}
      <div className="card p-5 bg-bg-card border border-border rounded-2xl shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Avatar Circle */}
            {profile?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar}
                alt={t('profile.title')}
                className="w-16 h-16 rounded-full object-cover border-2 border-accent/40 shadow-xs select-none"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-accent/15 border-2 border-accent/40 flex items-center justify-center font-bold text-accent text-2xl font-mono shadow-xs select-none">
                {athleteInitial}
              </div>
            )}

            {/* Name & Credentials */}
            <div className="space-y-0.5">
              <h2 className="text-xl font-bold font-sans text-text-primary tracking-tight leading-snug">
                {athleteName}
              </h2>
              <p className="text-xs text-text-muted font-medium font-sans truncate max-w-[190px]">
                {athleteEmail}
              </p>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-mono font-semibold uppercase tracking-wider bg-bg-secondary text-text-secondary border border-border">
                  <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                  {athleteTier.title} · {t('profile.level', { level: athleteTier.level })}
                </span>
                {athleteTier.estimatedCount > 0 && (
                  <p className="text-2xs text-amber-500 mt-1 leading-relaxed">
                    {t('profile.estimatedLifts', {
                      estimated: athleteTier.estimatedCount,
                      total: athleteTier.totalLifts,
                    })}
                  </p>
                )}
                {/* SIM-P2-18: the all-proxy case used to render under the
                    "excluded" copy above while actually being INCLUDED.
                    Say so plainly, plus the tables' real basis. */}
                {athleteTier.isEstimate && (
                  <p className="text-2xs text-amber-500 mt-1 leading-relaxed">
                    {t('profile.allEstimated')}
                  </p>
                )}
                <p className="text-2xs text-text-muted mt-1 leading-relaxed">
                  {t('profile.levelTablesNote')}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsEditProfileOpen(true)}
            className="p-2.5 rounded-xl bg-bg-secondary hover:bg-bg-tertiary border border-border text-text-secondary hover:text-accent transition-colors cursor-pointer"
            title={t('profile.editProfileDetails')}
            aria-label={t('profile.editProfile')}
          >
            <Edit2 className="w-4 h-4 text-accent" />
          </button>
        </div>

        {/* ── 3-Column Quick Metrics Card ──────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-border/60">
          <div className="p-3 rounded-xl bg-bg-secondary/60 border border-border/80 text-center shadow-2xs">
            <span className="text-2xs uppercase tracking-wider text-text-muted font-mono font-bold block">
              {t('profile.height')}
            </span>
            <span className="text-base sm:text-lg font-black text-text-primary font-mono block mt-0.5">
              {displayHeight()}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-bg-secondary/60 border border-border/80 text-center shadow-2xs">
            <span className="text-2xs uppercase tracking-wider text-text-muted font-mono font-bold block">
              {t('home.weight')}
            </span>
            <span className="text-base sm:text-lg font-black text-text-primary font-mono block mt-0.5">
              {displayWeight()}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-bg-secondary/60 border border-border/80 text-center shadow-2xs">
            <span className="text-2xs uppercase tracking-wider text-text-muted font-mono font-bold block">
              {t('profile.age')}
            </span>
            <span className="text-base sm:text-lg font-black text-text-primary font-mono block mt-0.5">
              {displayAge()}
            </span>
          </div>
        </div>
      </div>

      {/* ── SECTION 1: ACCOUNT & TRAINING MENU ──────────────────────────────── */}
      <div className="space-y-2">
        <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          {t('profile.sectionAccount')}
        </span>
        <div className="card p-2 sm:p-3 bg-bg-card border border-border rounded-2xl shadow-xs divide-y divide-border/60">
          {/* Edit Profile */}
          <button
            type="button"
            onClick={() => setIsEditProfileOpen(true)}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <User className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('profile.personalDetails')}</p>
                <p className="text-2xs text-text-muted">{t('profile.personalDetailsHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>

          {/* Fitness Goals */}
          <button
            type="button"
            onClick={() => setIsGoalSelectorOpen(true)}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Target className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('profile.fitnessGoals')}</p>
                <p className="text-2xs text-text-muted">
                  {goals.length > 0
                    ? goals.map((g) => ATHLETE_GOAL_CONFIGS[g]?.label || g).join(', ')
                    : t('profile.defaultGoal')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>

          {/* Notifications */}
          <button
            type="button"
            onClick={() => setIsReminderCenterOpen(true)}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Bell className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('profile.reminders')}</p>
                <p className="text-2xs text-text-muted">{t('profile.remindersHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>

          {/* Data Vault */}
          <button
            type="button"
            onClick={() => setIsDataVaultOpen(true)}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Database className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('profile.dataStorage')}</p>
                <p className="text-2xs text-text-muted">{t('profile.dataStorageHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => onNavigate?.('settings')}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Settings className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('profile.appSettings')}</p>
                <p className="text-2xs text-text-muted">{t('profile.appSettingsHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      </div>

      {/* ── SECTION 2: SHARING & COMMUNITY ──────────────────────────────────── */}
      <div className="space-y-2">
        <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          {t('profile.sectionSharing')}
        </span>
        <div className="card p-2 sm:p-3 bg-bg-card border border-border rounded-2xl shadow-xs divide-y divide-border/60">
          {/* Share Workout Routine */}
          <button
            type="button"
            onClick={handleShareSplit}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Share2 className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('profile.shareSplit')}</p>
                <p className="text-2xs text-text-muted">{t('profile.shareSplitHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>

          {/* Weekly Training Recap Card */}
          <button
            type="button"
            onClick={() => setIsWeeklyRecapOpen(true)}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Trophy className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('profile.weeklyCard')}</p>
                <p className="text-2xs text-text-muted">{t('profile.weeklyCardHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>

          {/* Feedback & Support */}
          <button
            type="button"
            onClick={() => setIsFeedbackOpen(true)}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <MessageSquare className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('profile.feedback')}</p>
                <p className="text-2xs text-text-muted">{t('profile.feedbackHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      </div>

      {/* ── Data & Account (FND-05) ───────────────────────────────────────────
          Log Out no longer lives here: all destructive actions sit in
          one place, Settings → Data & Account. This row navigates there
          and lands scrolled on that section. */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem('ascend_settings_section', 'data-account');
            } catch {}
            onNavigate?.('settings');
          }}
          className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-bg-card hover:bg-bg-secondary border border-border text-xs font-bold text-text-secondary hover:text-accent transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          <LogOut className="w-4 h-4 text-accent" />
          <span>{t('settings.dataAccount')}</span>
          <ChevronRight className="w-4 h-4 text-text-muted" />
        </button>
      </div>

      {/* ── Sub-Modals ──────────────────────────────────────────────────────── */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
      />

      <GoalSelectorModal
        isOpen={isGoalSelectorOpen}
        onClose={() => setIsGoalSelectorOpen(false)}
      />

      <ReminderCenterModal
        isOpen={isReminderCenterOpen}
        onClose={() => setIsReminderCenterOpen(false)}
      />

      <DataVaultModal
        isOpen={isDataVaultOpen}
        onClose={() => setIsDataVaultOpen(false)}
      />

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />

      <WeeklyRecapModal
        isOpen={isWeeklyRecapOpen}
        onClose={() => setIsWeeklyRecapOpen(false)}
      />

      {/* Plan picker: which program to share (never silently the first) */}
      {isSharePickerOpen && (
        <div ref={sharePickerRef} {...sharePickerDialogProps}
          className="modal-overlay"
          onClick={() => setIsSharePickerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('profile.choosePlanToShare')}
        >
          <div
            className="modal-content max-w-md w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-text-primary text-sm">{t('profile.shareWhichPlan')}</h3>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {plannedWorkouts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSharePlan(p);
                    setIsSharePickerOpen(false);
                  }}
                  className="w-full text-left p-3 rounded-xl bg-bg-secondary border border-border/70 hover:border-accent/60 transition-all cursor-pointer"
                >
                  <span className="block text-sm font-bold text-text-primary">{p.name}</span>
                  <span className="block text-2xs text-text-muted mt-0.5">
                    {t('profile.exercisesCount', { count: p.exercises.length })}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIsSharePickerOpen(false)}
              className="w-full py-2.5 rounded-xl bg-bg-secondary text-text-secondary text-sm font-semibold cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <ShareProgramModal
        plan={sharePlan}
        isOpen={Boolean(sharePlan)}
        onClose={() => setSharePlan(null)}
      />

    </div>
  );
}
