'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { formatHeightImperial, athleteNameToEmailSlug, plural } from '@/lib/formatters';
import { useAppNavigation } from '@/lib/navigation';
import EditProfileModal from '@/components/EditProfileModal';
import ConfirmationModal from '@/components/ConfirmationModal';
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
  const goals = useStore((state) => state.goals || []);
  const logout = useStore((state) => state.logout);
  const toast = useToast();

  const { goBack, canGoBack, registerBackHandler } = useAppNavigation();
  const { user, signOut } = useSupabaseSync();

  // Modals
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isGoalSelectorOpen, setIsGoalSelectorOpen] = useState(false);
  const [isReminderCenterOpen, setIsReminderCenterOpen] = useState(false);
  const [isDataVaultOpen, setIsDataVaultOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isWeeklyRecapOpen, setIsWeeklyRecapOpen] = useState(false);
  const [isShareProgramOpen, setIsShareProgramOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else if (canGoBack) {
      goBack();
    } else if (onNavigate) {
      onNavigate('home');
    }
  }, [onBack, canGoBack, goBack, onNavigate]);

  useEffect(() => {
    return registerBackHandler(() => {
      handleBack();
      return true;
    }, 45);
  }, [registerBackHandler, handleBack]);

  const handleConfirmLogout = async () => {
    setShowLogoutConfirm(false);
    try {
      await signOut();
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
    logout({ clearLocalData: false });
    toast.info('Logged out. Switched to welcome screen.', 'Logged Out');
    if (onNavigate) onNavigate('home');
  };

  const athleteName = profile?.name ? profile.name.trim() : 'Alex';
  const athleteInitial = athleteName.charAt(0).toUpperCase();
  const athleteEmail = user?.email || profile?.name ? `${athleteNameToEmailSlug(athleteName)}@athlete.local` : 'Local Guest Athlete';
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
            aria-label="Back to previous screen"
          >
            <ChevronLeft className="w-5 h-5 text-accent" />
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold font-sans text-text-primary tracking-tight">
            Profile
          </h1>
        </div>

        <button
          type="button"
          onClick={() => onNavigate?.('settings')}
          className="p-2 min-h-[44px] min-w-[44px] rounded-xl bg-bg-card border border-border text-text-secondary hover:text-accent transition-colors flex items-center justify-center cursor-pointer shadow-xs"
          title="App Settings"
          aria-label="Open Settings"
        >
          <Settings className="w-5 h-5 text-accent" />
        </button>
      </header>

      {/* ── Screen 22: Athlete Identity Hero Card ───────────────────────────── */}
      <div className="card p-5 bg-bg-card border border-border rounded-2xl shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Avatar Circle */}
            <div className="w-16 h-16 rounded-full bg-accent/15 border-2 border-accent/40 flex items-center justify-center font-bold text-accent text-2xl font-mono shadow-xs select-none">
              {athleteInitial}
            </div>

            {/* Name & Credentials */}
            <div className="space-y-0.5">
              <h2 className="text-xl font-bold font-sans text-text-primary tracking-tight leading-snug">
                {athleteName}
              </h2>
              <p className="text-xs text-text-muted font-medium font-sans truncate max-w-[190px]">
                {user?.email || athleteEmail}
              </p>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-3xs font-mono font-semibold uppercase tracking-wider bg-bg-secondary text-text-secondary border border-border">
                  <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                  Athlete Tier
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsEditProfileOpen(true)}
            className="p-2.5 rounded-xl bg-bg-secondary hover:bg-bg-tertiary border border-border text-text-secondary hover:text-accent transition-colors cursor-pointer"
            title="Edit Profile Details"
            aria-label="Edit Profile"
          >
            <Edit2 className="w-4 h-4 text-accent" />
          </button>
        </div>

        {/* ── 3-Column Quick Metrics Card ──────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-border/60">
          <div className="p-3 rounded-xl bg-bg-secondary/60 border border-border/80 text-center shadow-2xs">
            <span className="text-3xs uppercase tracking-wider text-text-muted font-mono font-bold block">
              Height
            </span>
            <span className="text-base sm:text-lg font-black text-text-primary font-mono block mt-0.5">
              {displayHeight()}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-bg-secondary/60 border border-border/80 text-center shadow-2xs">
            <span className="text-3xs uppercase tracking-wider text-text-muted font-mono font-bold block">
              Weight
            </span>
            <span className="text-base sm:text-lg font-black text-text-primary font-mono block mt-0.5">
              {displayWeight()}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-bg-secondary/60 border border-border/80 text-center shadow-2xs">
            <span className="text-3xs uppercase tracking-wider text-text-muted font-mono font-bold block">
              Age
            </span>
            <span className="text-base sm:text-lg font-black text-text-primary font-mono block mt-0.5">
              {displayAge()}
            </span>
          </div>
        </div>
      </div>

      {/* ── SECTION 1: ACCOUNT & TRAINING MENU ──────────────────────────────── */}
      <div className="space-y-2">
        <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          Account &amp; Training
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
                <p className="text-xs font-bold text-text-primary">Personal Details</p>
                <p className="text-3xs text-text-muted">Name, Gender, Height, Weight &amp; Age</p>
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
                <p className="text-xs font-bold text-text-primary">Fitness Goals</p>
                <p className="text-3xs text-text-muted">
                  {goals.length > 0 ? `${goals.length} ${plural(goals.length, 'active target goal')}` : 'Strength & Hypertrophy'}
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
                <p className="text-xs font-bold text-text-primary">Reminders &amp; Alerts</p>
                <p className="text-3xs text-text-muted">Hydration, workout and meal schedule prompts</p>
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
                <p className="text-xs font-bold text-text-primary">Data &amp; Storage</p>
                <p className="text-3xs text-text-muted">Local device storage, export &amp; backup</p>
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
                <p className="text-xs font-bold text-text-primary">App Settings</p>
                <p className="text-3xs text-text-muted">Theme, units, cloud account &amp; privacy controls</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      </div>

      {/* ── SECTION 2: SHARING & COMMUNITY ──────────────────────────────────── */}
      <div className="space-y-2">
        <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          Sharing &amp; Support
        </span>
        <div className="card p-2 sm:p-3 bg-bg-card border border-border rounded-2xl shadow-xs divide-y divide-border/60">
          {/* Share Workout Routine */}
          <button
            type="button"
            onClick={() => setIsShareProgramOpen(true)}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Share2 className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Share Workout Split</p>
                <p className="text-3xs text-text-muted">Export custom workout routine via link or QR code</p>
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
                <p className="text-xs font-bold text-text-primary">Weekly Training Card</p>
                <p className="text-3xs text-text-muted">Export shareable athletic performance summary</p>
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
                <p className="text-xs font-bold text-text-primary">Feedback &amp; Support</p>
                <p className="text-3xs text-text-muted">Report bugs or request new athletic features</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      </div>

      {/* ── Log Out Button ──────────────────────────────────────────────────── */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-bg-card hover:bg-bg-secondary border border-border text-xs font-bold text-text-secondary hover:text-accent transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          <LogOut className="w-4 h-4 text-accent" />
          <span>Log Out</span>
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

      <ShareProgramModal
        plan={plannedWorkouts[0] || null}
        isOpen={isShareProgramOpen}
        onClose={() => setIsShareProgramOpen(false)}
      />

      {/* Screen 24: Log Out Confirmation Modal */}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleConfirmLogout}
        title="Log Out of ASCEND?"
        message={
          user
            ? "Your account stays intact — your sessions, PRs and meal history remain saved and synced."
            : "Logging out clears your profile from this device. Your sessions, PRs, meals, plans and targets stay saved on this device and return when you set up your profile again."
        }
        confirmText="Log Out"
        cancelText="Cancel"
        variant="default"
        icon="logout"
      />
    </div>
  );
}
