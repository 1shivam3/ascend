'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { toUserMessage } from '@/lib/user-error';
import { useToast } from '@/components/ui/Toast';
import { resolveWorkoutMode } from '@/lib/workout-mode';
import {
  ChevronLeft,
  ChevronRight,
  User,
  Shield,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  Lock,
  Moon,
  Sun,
  Laptop,
  CheckCircle2,
  AlertCircle,
  FileText,
  ExternalLink,
  Calendar,
  Bell,
} from 'lucide-react';
import { exportFullBackupJSON, importFullBackupJSON } from '@/lib/storage';
import { buildCombinedCsvExport } from '@/lib/csv-export';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import { useAppNavigation } from '@/lib/navigation';
import { getTelemetryConsent, setTelemetryConsent, TelemetryConsent, TELEMETRY_CONSENT_EVENT } from '@/lib/telemetry';
import ConfirmationModal from '@/components/ConfirmationModal';
import AuthModal from '@/components/AuthModal';
import WeeklyScheduleModal from '@/components/WeeklyScheduleModal';
import ReminderCenterModal from '@/components/ReminderCenterModal';
import DietPreferencePicker from '@/components/DietPreferencePicker';
import ThemePicker from '@/components/ThemePicker';
import CustomizeSheet from '@/components/CustomizeSheet';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { ACCENT_PRESETS, deriveCustomAccent, normalizeHex } from '@/lib/accent-themes';
import { resolveTodayLayout, sanitizeTodayLayout, DEFAULT_TODAY_LAYOUT } from '@/lib/today-layout';
import LanguagePicker from '@/components/ui/LanguagePicker';
import PermissionHelp from '@/components/ui/PermissionHelp';
import { useTranslation } from '@/lib/i18n';
import {
  isHealthConnectAvailable,
  isHealthConnectSupported,
  openHealthConnectSettings,
  requestHealthAuthorization,
} from '@/lib/health-connect';
import { syncHealthConnectIfEnabled } from '@/lib/health-sync';

function SettingsToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer relative ${on ? 'bg-accent' : 'bg-border'}`}
    >
      <span
        className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}

export interface SettingsViewProps {
  onBack?: () => void;
  onNavigate?: (tab: 'home' | 'workout' | 'progress' | 'meals' | 'prs' | 'profile' | 'settings') => void;
  isModal?: boolean;
}

export default function SettingsView({ onBack, onNavigate, isModal = false }: SettingsViewProps) {
  const storeProfile = useStore((state) => state.profile);
  const profile = storeProfile ?? useStore.getState().profile;
  const setProfile = useStore((state) => state.setProfile);
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const resetThemeToSystem = useStore((state) => state.resetThemeToSystem);
  const hasCustomTheme = useStore((state) => state.hasCustomTheme);
  const importAllData = useStore((state) => state.importAllData);
  const uiPreferences = useStore((state) => state.uiPreferences);
  const setUiPreferences = useStore((state) => state.setUiPreferences);
  // UX redesign Stage 4 — this row drives the density-following workout
  // view (override null = Auto), not the legacy userMode key.
  const workoutMode = resolveWorkoutMode(uiPreferences.density, uiPreferences.workoutModeOverride);
  const plannedWorkouts = useStore((state) => state.plannedWorkouts);
  const toast = useToast();
  const { t } = useTranslation();
  const modeLabel = (m: string) =>
    t(
      m === 'intermediate'
        ? 'settings.modeIntermediate'
        : m === 'advanced'
        ? 'settings.modeAdvanced'
        : 'settings.modeBeginner'
    );

  const { goBack, canGoBack, registerBackHandler } = useAppNavigation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cloud Sync
  const {
    status: syncStatus,
    lastSyncedAt,
    syncNow,
    user,
    deleteAccount,
  } = useSupabaseSync();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isReminderCenterOpen, setIsReminderCenterOpen] = useState(false);

  // UX discoverability: Settings is one long scrolling page. These
  // section chips jump straight to each section so the user never has
  // to scroll-hunt for a setting they already know they want.
  const accountSectionRef = useRef<HTMLDivElement>(null);
  const appearanceSectionRef = useRef<HTMLDivElement>(null);
  const trainingSectionRef = useRef<HTMLDivElement>(null);
  const dataSectionRef = useRef<HTMLDivElement>(null);
  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // ── UX redesign Stage 6 — accent + dashboard personalization ──────────
  // Accent selection is NOT a theme-mode pick: it never touches
  // hasCustomTheme. The page.tsx effect restyles the app from these keys.
  const isDarkMode = theme === 'dark';
  const accentSwatches = ACCENT_PRESETS.map((p) => ({
    id: p.id,
    name: t(
      p.id === 'vermilion'
        ? 'settings.accentVermilion'
        : p.id === 'cobalt'
          ? 'settings.accentCobalt'
          : p.id === 'forest'
            ? 'settings.accentForest'
            : p.id === 'plum'
              ? 'settings.accentPlum'
              : p.id === 'teal'
                ? 'settings.accentTeal'
                : 'settings.accentRose',
    ),
    swatch: isDarkMode ? p.dark.accent : p.light.accent,
  }));
  const [draftHex, setDraftHex] = useState(() =>
    uiPreferences.accentTheme === 'custom' ? (uiPreferences.customAccentHex ?? '') : '',
  );
  const normalizedDraft = normalizeHex(draftHex);
  const customError =
    draftHex.trim() !== '' && !normalizedDraft ? t('settings.customAccentInvalid') : null;
  const customDerived =
    normalizedDraft !== null
      ? deriveCustomAccent(normalizedDraft, isDarkMode ? 'dark' : 'light')
      : null;
  const customPreview = customDerived?.variant ?? null;
  const customPreviewNote = customDerived?.correctedNote
    ? t('settings.customAccentAdjusted', { shade: customDerived.variant.text, entered: normalizedDraft ?? '' })
    : null;
  const handleSelectPreset = (id: string) => {
    setUiPreferences({
      accentTheme: id as 'vermilion' | 'cobalt' | 'forest' | 'plum' | 'teal' | 'rose',
    });
  };
  const handleApplyCustom = () => {
    if (!normalizedDraft) return;
    setUiPreferences({ accentTheme: 'custom', customAccentHex: normalizedDraft });
  };
  const handleCancelCustom = () => {
    setDraftHex(uiPreferences.accentTheme === 'custom' ? (uiPreferences.customAccentHex ?? '') : '');
  };
  const handleResetTheme = () => {
    setUiPreferences({ accentTheme: 'vermilion', customAccentHex: null });
    toast.info(t('settings.themeResetMsg'));
  };

  // ── UX redesign Stage 6 — the same Customize Today sheet as Today ──────
  // Sheet labels must match the visible Today section titles exactly.
  const sheetSectionTitles: Record<string, string> = {
    'nutrition-strip': t('home.nutrition'),
    coach: t('home.coachSection'),
    'habit-matrix': t('home.habitsThisWeek'),
    'quick-actions': t('home.quickActions'),
    hydration: t('home.hydration'),
    readiness: t('home.readiness'),
    level: t('home.level'),
    steps: t('health.stepsToday'),
    challenge: t('home.monthlyChallenge'),
    'weekly-review-detail': t('weeklyReview.cardTitle'),
  };
  const resolvedTodayForSheet = useMemo(
    () => resolveTodayLayout(uiPreferences.todayLayout, uiPreferences.density),
    [uiPreferences.todayLayout, uiPreferences.density],
  );
  const rawTodayLayoutForSheet = useMemo(
    () => sanitizeTodayLayout(uiPreferences.todayLayout),
    [uiPreferences.todayLayout],
  );
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const handleToggleSection = (id: string, next: boolean) => {
    setUiPreferences({
      todayLayout: { ...rawTodayLayoutForSheet, visible: { ...rawTodayLayoutForSheet.visible, [id]: next } },
    });
  };
  const handleMoveSection = (id: string, dir: -1 | 1) => {
    const order = [...rawTodayLayoutForSheet.order];
    const idx = order.indexOf(id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= order.length) return;
    [order[idx], order[next]] = [order[next], order[idx]];
    setUiPreferences({ todayLayout: { ...rawTodayLayoutForSheet, order } });
  };
  const handleRestoreLayout = () => {
    setUiPreferences({ todayLayout: { ...DEFAULT_TODAY_LAYOUT, order: [...DEFAULT_TODAY_LAYOUT.order] } });
    toast.success(t('customize.layoutRestored'));
  };


  // Health Connect (Android only — the whole block renders only where
  // the capability exists; web/PWA never sees dead UI).
  const healthSupported = isHealthConnectSupported();
  const healthConnectLastSyncedAt = useStore((state) => state.healthConnectLastSyncedAt);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'connecting' | 'denied' | 'unavailable'>('idle');

  const handleHealthConnectToggle = async () => {
    if (uiPreferences.healthConnectEnabled === true) {
      setUiPreferences({ healthConnectEnabled: false });
      setHealthStatus('idle');
      toast.info(t('settings.healthOffMsg'), t('health.title'));
      return;
    }
    setHealthStatus('connecting');
    const available = await isHealthConnectAvailable();
    if (!available) {
      setHealthStatus('unavailable');
      return;
    }
    const auth = await requestHealthAuthorization();
    if (auth === 'granted') {
      setUiPreferences({ healthConnectEnabled: true });
      setHealthStatus('idle');
      const outcome = await syncHealthConnectIfEnabled();
      toast.success(
        outcome === 'synced'
          ? t('settings.healthSyncedMsg')
          : t('settings.healthConnectedMsg'),
        t('health.title')
      );
    } else if (auth === 'denied') {
      // Same denied-permission pattern as everywhere else (Item 0):
      // purpose line + button into Health Connect's own settings.
      setHealthStatus('denied');
    } else {
      setHealthStatus('idle');
      toast.error(t('settings.healthFailedMsg'), t('health.title'));
    }
  };
  const [telemetryConsent, setTelemetryConsentState] = useState<TelemetryConsent>(null);

  useEffect(() => {
    setTelemetryConsentState(getTelemetryConsent());
    const handler = () => setTelemetryConsentState(getTelemetryConsent());
    window.addEventListener(TELEMETRY_CONSENT_EVENT, handler);
    return () => window.removeEventListener(TELEMETRY_CONSENT_EVENT, handler);
  }, []);

  // Back button handling
  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else if (canGoBack) {
      goBack();
    } else if (onNavigate) {
      onNavigate('profile');
    }
  }, [onBack, canGoBack, goBack, onNavigate]);

  // Register a system-back handler only in modal mode (onBack provided), where
  // it safely closes the modal. In full-page mode the navigation stack already
  // handles back; registering handleBack here would recurse
  // (handleBack -> goBack -> runBackHandlers -> handleBack ...).
  useEffect(() => {
    if (!onBack) return;
    return registerBackHandler(() => {
      handleBack();
      return true;
    }, 50);
  }, [registerBackHandler, handleBack, onBack]);

  // Close the schedule modal on system back while it is open.
  useEffect(() => {
    if (isScheduleModalOpen) {
      return registerBackHandler(() => {
        setIsScheduleModalOpen(false);
        return true;
      }, 100);
    }
  }, [isScheduleModalOpen, registerBackHandler]);

  // Sync action
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncNow();
      toast.success(t('settings.syncDoneMsg'), t('settings.syncDoneTitle'));
    } catch {
      toast.error(t('settings.syncErrorMsg'), t('settings.syncErrorTitle'));
    } finally {
      setIsSyncing(false);
    }
  };

  // Export JSON Backup
  const handleExportBackup = () => {
    try {
      const jsonStr = exportFullBackupJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `ascend_backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t('settings.backupSavedMsg'), t('settings.backupSavedTitle'));
    } catch {
      toast.error(t('settings.exportErrorMsg'), t('settings.exportErrorTitle'));
    }
  };

  // Export CSV (workouts + meals + body metrics in one file, same
  // download mechanism as the JSON backup so it works in the WebView).
  const handleExportCsv = () => {
    try {
      const state = useStore.getState();
      const csv = buildCombinedCsvExport({
        workouts: state.workouts || [],
        meals: state.meals || [],
        bodyMetrics: state.bodyMetrics || [],
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `ascend_export_${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t('settings.csvExportedMsg'), t('settings.csvExportedTitle'));
    } catch {
      toast.error(t('settings.csvErrorMsg'), t('settings.exportErrorTitle'));
    }
  };

  // Restore JSON Backup
  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const success = importAllData(parsed);
        importFullBackupJSON(content);
        if (success) {
          toast.success(t('settings.restoredMsg'), t('settings.restoredTitle'));
        } else {
          toast.error(t('settings.invalidBackupMsg'), t('settings.restoreFailedTitle'));
        }
      } catch {
        toast.error(t('settings.parseFailedMsg'), t('settings.parseFailedTitle'));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Delete account confirmation
  const handleExecuteDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAccount();
      if (result.success) {
        setShowDeleteConfirm(false);
        toast.success(t('settings.accountDeletedMsg'), t('settings.accountDeletedTitle'));
        if (onNavigate) onNavigate('home');
      } else {
        toast.info(result.error || t('settings.localPurgedMsg'), t('settings.dataPurgedTitle'));
        setShowDeleteConfirm(false);
      }
    } catch (err: any) {
      toast.error(toUserMessage(err, 'generic'));
    } finally {
      setIsDeleting(false);
    }
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
            aria-label={t('common.back')}
          >
            <ChevronLeft className="w-5 h-5 text-accent" />
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold font-sans text-text-primary tracking-tight">
            {t('settings.title')}
          </h1>
        </div>
      </header>

      {/* ── Section chips: jump links for the long page (sticky, below the You bar) ── */}
      <div className="sticky top-14 z-20 bg-bg-primary/95 backdrop-blur py-2 -mx-1 px-1 flex gap-1.5 overflow-x-auto">
        {(
          [
            { labelKey: 'settings.accountSecurity', ref: accountSectionRef },
            { labelKey: 'settings.appearancePersonalization', ref: appearanceSectionRef },
            { labelKey: 'settings.trainingPreferences', ref: trainingSectionRef },
            { labelKey: 'settings.dataPrivacyLegal', ref: dataSectionRef },
          ] as const
        ).map((chip) => (
          <button
            key={chip.labelKey}
            type="button"
            onClick={() => scrollToSection(chip.ref)}
            className="shrink-0 px-3 py-1.5 rounded-full bg-bg-secondary border border-border text-2xs font-bold text-text-secondary hover:text-accent hover:border-accent/40 transition-colors cursor-pointer"
          >
            {t(chip.labelKey)}
          </button>
        ))}
      </div>

      {/* ── SECTION 1: ACCOUNT & SECURITY ─────────────────────────────────────── */}
      <div ref={accountSectionRef} className="space-y-2 scroll-mt-28">
        <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          {t('settings.accountSecurity')}
        </span>
        <div className="card p-4 sm:p-5 bg-bg-card border border-border rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-bold text-text-primary font-sans block">
                {user?.email || profile?.name || t('common.guestAthlete')}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    syncStatus === 'synced'
                      ? 'bg-sage'
                      : syncStatus === 'syncing'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-text-muted'
                  }`}
                />
                <span className="text-2xs font-mono text-text-muted">
                  {user
                    ? syncStatus === 'synced'
                      ? t('settings.cloudSynced')
                      : syncStatus === 'syncing'
                      ? t('settings.syncing')
                      : t('settings.syncIdle')
                    : t('settings.localOnly')}
                </span>
              </div>
            </div>

            {user ? (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="p-2.5 rounded-xl bg-bg-secondary hover:bg-bg-tertiary border border-border text-text-secondary hover:text-accent transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                title={t('settings.syncNow')}
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-accent' : ''}`} />
                <span>{t('settings.sync')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="py-1.5 px-3 rounded-xl bg-accent hover:bg-accent-dim text-accent-on text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                {t('settings.signIn')}
              </button>
            )}
          </div>
        </div>
        <div className="card p-4 sm:p-5 bg-bg-card border border-border rounded-2xl shadow-xs space-y-3">
          <span className="text-xs font-semibold text-text-secondary font-sans">{t('settings.accountMethods')}</span>
          {user ? (
            <p className="text-xs text-text-primary">
              {t('settings.signedInWith', {
                method: user.isAnonymous
                  ? t('settings.methodGuest')
                  : user.provider === 'apple'
                    ? t('settings.methodApple')
                    : user.provider === 'google'
                      ? t('settings.methodGoogle')
                      : t('settings.methodEmailPassword'),
              })}
            </p>
          ) : (
            <p className="text-xs text-text-primary">{t('settings.guestMethodNote')}</p>
          )}
          <p className="text-2xs text-text-muted leading-relaxed">{t('settings.supportedMethods')}</p>
          {!user && (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="py-1.5 px-3 rounded-xl bg-accent hover:bg-accent-dim text-accent-on text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              {t('settings.signIn')}
            </button>
          )}
        </div>
      </div>

      {/* ── SECTION 2: APPEARANCE & PERSONALIZATION ───────────────────────────── */}
      <div ref={appearanceSectionRef} className="space-y-2 scroll-mt-28">
        <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          {t('settings.appearancePersonalization')}
        </span>
        <div className="card p-4 sm:p-5 bg-bg-card border border-border rounded-2xl shadow-xs space-y-4">
          {/* Appearance / Theme */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary font-sans">{t('settings.appearance')}</span>
              <span className="text-2xs font-mono text-text-muted capitalize">
                {hasCustomTheme ? (theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')) : t('settings.systemDefault')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-bg-secondary border border-border">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  hasCustomTheme && theme === 'light'
                    ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>{t('settings.themeChalk')}</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  hasCustomTheme && theme === 'dark'
                    ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>{t('settings.themeGraphite')}</span>
              </button>
              <button
                type="button"
                onClick={() => resetThemeToSystem()}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  !hasCustomTheme
                    ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>{t('settings.themeSystem')}</span>
              </button>
            </div>
          </div>

          {/* Text size (SIM-P1-08): 10px labels are unreadable for
              older eyes; root scaling covers all rem-based text. */}
          <div className="space-y-2 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary font-sans">{t('settings.textSize')}</span>
              <span className="text-2xs font-mono text-text-muted">
                {uiPreferences.textScale === 'large'
                  ? t('settings.textLarge')
                  : uiPreferences.textScale === 'xlarge'
                  ? t('settings.textXLarge')
                  : t('settings.textNormal')}
              </span>
            </div>
            <p className="text-2xs text-text-muted leading-relaxed">
              {t('settings.textSizeHint')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: t('settings.textNormal'), value: 'normal' as const },
                { label: t('settings.textLarge'), value: 'large' as const },
                { label: t('settings.textXLarge'), value: 'xlarge' as const },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setUiPreferences({ textScale: opt.value })}
                  className={`px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    uiPreferences.textScale === opt.value
                      ? 'bg-accent text-accent-on border-accent'
                      : 'bg-bg-secondary text-text-secondary border-border hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="card p-4 sm:p-5 bg-bg-card border border-border rounded-2xl shadow-xs space-y-4">
          {/* Accent theme — six presets + custom hex (personalization-spec §1) */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-text-secondary font-sans">{t('settings.accentTheme')}</span>
            <ThemePicker
              swatches={accentSwatches}
              selectedId={uiPreferences.accentTheme}
              customHex={draftHex}
              customError={customError}
              preview={customPreview}
              previewNote={customPreviewNote}
              onSelectPreset={handleSelectPreset}
              onCustomHexChange={setDraftHex}
              onApplyCustom={handleApplyCustom}
              onCancelCustom={handleCancelCustom}
              onReset={handleResetTheme}
            />
          </div>

          {/* Information density — one key for the whole app */}
          <div className="space-y-2 pt-3 border-t border-border/60">
            <span className="text-xs font-semibold text-text-secondary font-sans">{t('settings.density')}</span>
            <p className="text-2xs text-text-muted leading-relaxed">{t('settings.densityHint')}</p>
            <SegmentedControl
              ariaLabel={t('settings.density')}
              value={uiPreferences.density}
              options={[
                { value: 'simple', label: t('settings.densitySimple') },
                { value: 'detailed', label: t('settings.densityDetailed') },
              ]}
              onChange={(v) => setUiPreferences({ density: v })}
            />
          </div>

          {/* Dashboard cards — the same Customize Today sheet as Today */}
          <div className="pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={() => setIsCustomizeOpen(true)}
              className="w-full flex items-center justify-between cursor-pointer text-left"
            >
              <div>
                <p className="text-xs font-bold text-text-primary">{t('customize.today')}</p>
                <p className="text-2xs text-text-muted">{t('settings.customizeTodayHint')}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: TRAINING PREFERENCES ───────────────────────────────────── */}
      <div ref={trainingSectionRef} className="space-y-2 scroll-mt-28">
        <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          {t('settings.trainingPreferences')}
        </span>
        <div className="card p-4 sm:p-5 bg-bg-card border border-border rounded-2xl shadow-xs space-y-4">
          {/* Weekly workout target */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary font-sans">{t('settings.weeklyWorkoutTarget')}</span>
              <span className="text-2xs font-mono text-text-muted">
                {uiPreferences.weeklyTargetDays === null
                  ? t('settings.targetAuto')
                  : uiPreferences.weeklyTargetDays === 0
                  ? t('settings.targetOff')
                  : t('settings.targetDays', { days: uiPreferences.weeklyTargetDays })}
              </span>
            </div>
            <p className="text-2xs text-text-muted leading-relaxed">
              {t('settings.weeklyTargetHint')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: t('settings.auto'), value: null as number | null },
                { label: t('settings.off'), value: 0 as number | null },
                { label: '2', value: 2 as number | null },
                { label: '3', value: 3 as number | null },
                { label: '4', value: 4 as number | null },
                { label: '5', value: 5 as number | null },
                { label: '6', value: 6 as number | null },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setUiPreferences({ weeklyTargetDays: opt.value })}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    uiPreferences.weeklyTargetDays === opt.value
                      ? 'bg-accent text-accent-on border-accent'
                      : 'bg-bg-secondary text-text-muted border-border hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Weekly schedule editor */}
          <div className="pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={() => setIsScheduleModalOpen(true)}
              className="w-full flex items-center justify-between cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-text-primary">{t('settings.weeklySchedule')}</p>
                  <p className="text-2xs text-text-muted">{t('settings.weeklyScheduleHint')}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {/* Unit Preference */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary font-sans">{t('settings.units')}</span>
              <span className="text-2xs font-mono text-text-muted uppercase">{profile?.unit === 'kg' ? t('settings.unitKg') : profile?.unit === 'lbs' ? t('settings.unitLbs') : (profile?.unit || 'lbs')}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-bg-secondary border border-border">
              <button
                type="button"
                onClick={() => {
                  if (profile) setProfile({ ...profile, unit: 'lbs' });
                  toast.info(t('settings.unitsImperialMsg'), t('settings.unitsUpdatedTitle'));
                }}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  profile?.unit === 'lbs'
                    ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {t('settings.unitsImperial')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (profile) setProfile({ ...profile, unit: 'kg' });
                  toast.info(t('settings.unitsMetricMsg'), t('settings.unitsUpdatedTitle'));
                }}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  profile?.unit === 'kg'
                    ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {t('settings.unitsMetric')}
              </button>
            </div>
          </div>

          {/* Language */}
          <div className="space-y-2 pt-1">
            <div>
              <span className="text-xs font-bold text-text-primary block">{t('settings.language')}</span>
              <span className="text-2xs text-text-muted block mt-0.5">
                {t('settings.languageHint')}
              </span>
            </div>
            <LanguagePicker />
          </div>

          {/* Diet Preference — shared picker, also surfaced on Fuel */}
          <div className="pt-1">
            <DietPreferencePicker />
          </div>

          {/* Experience Mode */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary font-sans">{t('settings.experience')}</span>
              <span className="text-2xs font-mono text-text-muted capitalize">{modeLabel(workoutMode)}{uiPreferences.workoutModeOverride ? '' : ` · ${t('workout.viewAuto')}`}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-bg-secondary border border-border">
              {(['auto', 'beginner', 'advanced'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setUiPreferences({ workoutModeOverride: m === 'auto' ? null : m });
                    toast.info(t('settings.modeSetMsg', { mode: m === 'auto' ? t('workout.viewAuto') : modeLabel(m) }), t('settings.modeUpdatedTitle'));
                  }}
                  className={`py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                    (uiPreferences.workoutModeOverride ?? 'auto') === m
                      ? 'bg-bg-card text-text-primary shadow-xs border border-border'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {m === 'auto' ? t('workout.viewAuto') : modeLabel(m)}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications — the single home for reminder settings.
              The Today bell stays as a shortcut; this row is where a
              user hunting "notification settings" actually looks. */}
          <div className="pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={() => setIsReminderCenterOpen(true)}
              className="w-full flex items-center justify-between cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-text-primary">{t('home.notificationSettings')}</p>
                  <p className="text-2xs text-text-muted">{t('home.notifications')}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {/* Gamification toggle */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div>
              <p className="text-xs font-bold text-text-primary">{t('settings.gamification')}</p>
              <p className="text-2xs text-text-muted leading-relaxed">{t('settings.gamificationHint')}</p>
            </div>
            <SettingsToggle
              label={t('settings.toggleGamification')}
              on={uiPreferences.gamificationEnabled}
              onToggle={() => setUiPreferences({ gamificationEnabled: !uiPreferences.gamificationEnabled })}
            />
          </div>

          {/* Coach toggle */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div>
              <p className="text-xs font-bold text-text-primary">{t('settings.coach')}</p>
              <p className="text-2xs text-text-muted leading-relaxed">{t('settings.coachHint')}</p>
            </div>
            <SettingsToggle
              label={t('settings.toggleCoach')}
              on={uiPreferences.coachEnabled}
              onToggle={() => setUiPreferences({ coachEnabled: !uiPreferences.coachEnabled })}
            />
          </div>

          {/* Habit matrix toggle */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div>
              <p className="text-xs font-bold text-text-primary">{t('settings.habitMatrix')}</p>
              <p className="text-2xs text-text-muted leading-relaxed">{t('settings.habitMatrixHint')}</p>
            </div>
            <SettingsToggle
              label={t('settings.toggleHabitMatrix')}
              on={uiPreferences.showHabitMatrix}
              onToggle={() => setUiPreferences({ showHabitMatrix: !uiPreferences.showHabitMatrix })}
            />
          </div>

          {/* Muscle volume toggle (Progress) */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div>
              <p className="text-xs font-bold text-text-primary">{t('progress.muscleVolume')}</p>
              <p className="text-2xs text-text-muted leading-relaxed">{t('settings.muscleVolumeHint')}</p>
            </div>
            <SettingsToggle
              label={t('settings.toggleMuscleVolume')}
              on={uiPreferences.showMuscleVolume !== false}
              onToggle={() => setUiPreferences({ showMuscleVolume: uiPreferences.showMuscleVolume === false })}
            />
          </div>

          {/* Health Connect sync (Android only — absent elsewhere) */}
          {healthSupported && (
            <div className="pt-3 border-t border-border/60 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-text-primary">{t('health.title')}</p>
                  <p className="text-2xs text-text-muted leading-relaxed">{t('health.hint')}</p>
                </div>
                <SettingsToggle
                  label={t('settings.toggleHealth')}
                  on={uiPreferences.healthConnectEnabled === true}
                  onToggle={handleHealthConnectToggle}
                />
              </div>
              {uiPreferences.healthConnectEnabled === true && (
                <p className="text-2xs text-text-muted">
                  {healthConnectLastSyncedAt
                    ? t('health.lastSynced', {
                        time: new Date(healthConnectLastSyncedAt).toLocaleString(),
                      })
                    : t('health.neverSynced')}
                </p>
              )}
              {healthStatus === 'connecting' && (
                <p className="text-2xs text-text-muted">{t('settings.healthOpening')}</p>
              )}
              {healthStatus === 'unavailable' && (
                <p className="text-2xs text-amber-300 leading-relaxed">{t('health.unavailable')}</p>
              )}
              {healthStatus === 'denied' && (
                <PermissionHelp
                  permission="health"
                  isNative
                  onOpenSettings={openHealthConnectSettings}
                  onRetry={handleHealthConnectToggle}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 4: DATA & PRIVACY ────────────────────────────────────────── */}
      <div ref={dataSectionRef} className="space-y-2 scroll-mt-20">
        <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
          {t('settings.dataPrivacyLegal')}
        </span>
        <div className="card p-2 sm:p-3 bg-bg-card border border-border rounded-2xl shadow-xs divide-y divide-border/60">
          {/* Export JSON */}
          <button
            type="button"
            onClick={handleExportBackup}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('settings.exportJson')}</p>
                <p className="text-2xs text-text-muted">{t('settings.exportJsonHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('settings.exportCsv')}</p>
                <p className="text-2xs text-text-muted">{t('settings.exportCsvHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>

          {/* Import JSON */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
            aria-label={t('settings.importAria')}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Upload className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('settings.importBackup')}</p>
                <p className="text-2xs text-text-muted">{t('settings.importBackupHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleRestoreFile}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />

          {/* Privacy Policy */}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('settings.privacyPolicy')}</p>
                <p className="text-2xs text-text-muted">{t('settings.privacyPolicyHint')}</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-text-muted" />
          </a>

          {/* Terms of Service */}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('settings.terms')}</p>
                <p className="text-2xs text-text-muted">{t('settings.termsHint')}</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-text-muted" />
          </a>

          {/* Health & Safety Disclaimer */}
          <a
            href="/disclaimer"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('settings.disclaimer')}</p>
                <p className="text-2xs text-text-muted">{t('settings.disclaimerHint')}</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-text-muted" />
          </a>

          {/* Account & Data Deletion portal (web-accessible, Play requirement) */}
          <a
            href="/delete-account"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-3 flex items-center justify-between hover:bg-bg-secondary/60 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">{t('settings.deleteDataWeb')}</p>
                <p className="text-2xs text-text-muted">{t('settings.deleteDataWebHint')}</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-text-muted" />
          </a>

          {/* The full medical note lives on the Disclaimer page linked
              above — the wall of text here is gone, the meaning stays. */}

          {/* Anonymous Telemetry */}
          <div className="w-full p-3 flex items-center justify-between">
            <div className="space-y-0.5 pr-2">
              <p className="text-xs font-bold text-text-primary">{t('settings.diagnostics')}</p>
              <p className="text-2xs text-text-muted">{t('settings.diagnosticsHint')}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next: 'accepted' | 'declined' = telemetryConsent === 'accepted' ? 'declined' : 'accepted';
                setTelemetryConsent(next);
                setTelemetryConsentState(next);
                toast.info(
                  next === 'accepted' ? t('settings.diagnosticsOn') : t('settings.diagnosticsOff'),
                  t('settings.privacyUpdatedTitle')
                );
              }}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                telemetryConsent === 'accepted' ? 'bg-accent' : 'bg-bg-secondary border border-border'
              }`}
              aria-label={t('settings.toggleDiagnostics')}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                  telemetryConsent === 'accepted' ? 'right-0.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Delete Account (Danger Action) */}
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full p-3 flex items-center justify-between hover:bg-accent/10 rounded-xl transition-colors cursor-pointer text-left text-accent"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-accent">{t('settings.deleteAccount')}</p>
                <p className="text-2xs text-text-muted">{t('settings.deleteAccountHint')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-accent" />
          </button>
        </div>
      </div>


      {isScheduleModalOpen && (
        <WeeklyScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          plannedWorkouts={plannedWorkouts}
        />
      )}

      <ReminderCenterModal
        isOpen={isReminderCenterOpen}
        onClose={() => setIsReminderCenterOpen(false)}
      />

      {/* ── Screen 24: Confirmation Modals ──────────────────────────────────── */}
      {/* Delete Account Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleExecuteDeleteAccount}
        title={t('settings.deleteTitle')}
        message={t('settings.deleteMsg')}
        confirmText={t('settings.deleteAccount')}
        cancelText={t('common.cancel')}
        variant="danger"
        icon="trash"
        requireTypedConfirmation="DELETE"
        isLoading={isDeleting}
      />

      {/* Auth Modal for guest sign-in */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <CustomizeSheet
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        sections={[
          { id: 'workout-card', title: t('home.todaysWorkout'), locked: true },
          ...resolvedTodayForSheet.map((s) => ({ id: s.id, title: sheetSectionTitles[s.id] ?? s.id })),
        ]}
        shown={{ 'workout-card': true, ...Object.fromEntries(resolvedTodayForSheet.map((s) => [s.id, s.shown])) }}
        onToggle={handleToggleSection}
        onMove={handleMoveSection}
        onRestore={handleRestoreLayout}
      />

    </div>
  );
}
